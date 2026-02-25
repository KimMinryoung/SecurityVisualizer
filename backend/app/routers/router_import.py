import asyncio
import json
import re
import tempfile
import pathlib
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/api/router", tags=["router"])

_SS_DIR = pathlib.Path(tempfile.gettempdir()) / 'secvis'
_SS_DIR.mkdir(exist_ok=True)

# 인터셉터:
# 1. Object.defineProperty로 CryptoJS 할당 즉시 훅 (setInterval 경쟁 조건 방지)
# 2. JSON.parse 훅 (보조)
# 3. XHR 훅 (보조)
_INTERCEPT_SCRIPT = r"""
window.__capturedAPI = [];

// --- CryptoJS.AES.decrypt 훅: defineProperty로 할당 즉시 캡처 ---
// setInterval 대신 setter 트랩 사용 — TP-Link 코드가 로컬 변수에 캐시하기 전에 훅
(function() {
    var _storedCJS;
    function _hookCJS(obj) {
        if (!obj || !obj.AES || !obj.AES.decrypt || obj.__sv_hooked) return;
        obj.__sv_hooked = true;
        var _origDec = obj.AES.decrypt;
        obj.AES.decrypt = function(ciphertext, key, cfg) {
            var result = _origDec.apply(this, arguments);
            try {
                var plain = result.toString(obj.enc.Utf8);
                if (plain && plain.length > 20) {
                    window.__capturedAPI.push({source: 'aesdecrypt', url: '', status: 200, text: plain});
                }
            } catch(e) {}
            return result;
        };
    }
    try {
        Object.defineProperty(window, 'CryptoJS', {
            configurable: true,
            enumerable: true,
            get: function() { return _storedCJS; },
            set: function(v) { _storedCJS = v; _hookCJS(v); }
        });
    } catch(e) {
        // defineProperty 실패 시 폴링 폴백
        var _t = setInterval(function() {
            if (window.CryptoJS) { _hookCJS(window.CryptoJS); clearInterval(_t); }
        }, 30);
        setTimeout(function() { clearInterval(_t); }, 15000);
    }
})();

// --- JSON.parse 훅 (보조) ---
var _origJSONParse = JSON.parse;
JSON.parse = function(text) {
    var result = _origJSONParse.apply(this, arguments);
    try {
        if (typeof text === 'string' && text.length > 30 && text.length < 500000) {
            var t = text.trim();
            if (t[0] === '{' || t[0] === '[') {
                window.__capturedAPI.push({source: 'jsonparse', url: '', status: 200, text: text});
            }
        }
    } catch(e) {}
    return result;
};

// --- XHR 훅 (보조) ---
var _xhrOpen = XMLHttpRequest.prototype.open;
var _xhrSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function(method, url) {
    this.__xhrUrl = url;
    return _xhrOpen.apply(this, arguments);
};
XMLHttpRequest.prototype.send = function(body) {
    var self = this;
    self.addEventListener('load', function() {
        try {
            var url = String(self.__xhrUrl || '');
            if (url.indexOf('cgi-bin') !== -1) {
                window.__capturedAPI.push({source: 'xhr', url: url, status: self.status, text: self.responseText || ''});
            }
        } catch(e) {}
    });
    return _xhrSend.apply(this, arguments);
};
"""

_MAC_RE = re.compile(r'^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$')


class RouterClient(BaseModel):
    ip_address: str
    mac_address: Optional[str] = None
    hostname: Optional[str] = None


class RouterImportRequest(BaseModel):
    password: str
    url: str = "http://192.168.0.1"


_IP_RE = re.compile(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$')


def _extract_clients(obj, depth=0) -> list:
    if depth > 8 or not obj:
        return []
    clients = []
    if isinstance(obj, list):
        for item in obj:
            if isinstance(item, dict):
                ip = (item.get('ip_addr') or item.get('ip_address') or
                      item.get('ip') or item.get('ipAddr') or item.get('IP') or
                      item.get('ipAddress') or item.get('address'))
                mac = (item.get('mac_addr') or item.get('mac_address') or
                       item.get('mac') or item.get('macAddr') or item.get('MAC') or
                       item.get('macAddress') or item.get('hwaddr') or item.get('hwAddr'))
                name = (item.get('client_name') or item.get('hostname') or
                        item.get('name') or item.get('host_name') or item.get('hostName') or
                        item.get('deviceName') or item.get('device_name') or
                        item.get('client_hostname') or '')
                if ip and _IP_RE.match(str(ip)):
                    clients.append({
                        'ip_address': str(ip),
                        'mac_address': str(mac).upper().replace('-', ':') if mac else None,
                        'hostname': str(name).strip() if name else None,
                    })
                else:
                    clients.extend(_extract_clients(item, depth + 1))
    elif isinstance(obj, dict):
        for v in obj.values():
            if isinstance(v, (list, dict)):
                clients.extend(_extract_clients(v, depth + 1))
    return clients


def _try_extract(captured_api: list) -> list:
    for entry in captured_api:
        text = entry.get('text', '')
        if not text or len(text) < 10:
            continue
        try:
            data = json.loads(text)
            c = _extract_clients(data)
            if c:
                return c
        except Exception:
            pass
    return []


def _read_dom_table(page) -> list:
    """현재 페이지의 테이블에서 IP 주소를 포함한 행을 직접 추출"""
    rows = page.evaluate(r"""() => {
        const ipRe = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
        const result = [];
        for (const tr of document.querySelectorAll('tr')) {
            const cells = Array.from(tr.querySelectorAll('td, th'))
                .map(td => (td.textContent || '').trim());
            if (cells.length >= 2 && cells.some(c => ipRe.test(c))) {
                result.push(cells);
            }
        }
        return result;
    }""")

    clients = []
    for cells in rows:
        ip = next((c for c in cells if _IP_RE.match(c)), None)
        mac = next((c for c in cells if _MAC_RE.match(c)), None)
        if not ip:
            continue
        skip = {ip, mac or '', '--', '-', 'n/a', 'connected', 'wired', 'wireless', ''}
        name = next(
            (c for c in cells
             if c.lower() not in skip
             and not _IP_RE.match(c)
             and not _MAC_RE.match(c)
             and not re.match(r'^\d+$', c)),  # 순번(1,2,3...) 제외
            None
        )
        clients.append({
            'ip_address': ip,
            'mac_address': mac.upper().replace('-', ':') if mac else None,
            'hostname': name,
        })
    return clients


def _dedup(clients: list) -> list:
    seen: set = set()
    unique = []
    for c in clients:
        if c['ip_address'] not in seen:
            seen.add(c['ip_address'])
            unique.append(c)
    return unique


def _scrape_tplink(password: str, base_url: str) -> list:
    from playwright.sync_api import sync_playwright, TimeoutError as PwError

    base_url = base_url.rstrip('/')
    stok_ref: list = ['']
    captured_urls: list = []

    def handle_route(route):
        try:
            response = route.fetch()
        except Exception:
            route.abort()
            return
        url = route.request.url
        captured_urls.append(url)
        if 'cgi-bin' in url:
            m = re.search(r';stok=([a-zA-Z0-9]{8,})', url)
            if m:
                stok_ref[0] = m.group(1)
        route.fulfill(response=response)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        context.add_init_script(_INTERCEPT_SCRIPT)
        page = context.new_page()
        page.route('**/*', handle_route)

        try:
            page.goto(base_url, timeout=30000, wait_until='domcontentloaded')
            try:
                page.wait_for_url('**login**', timeout=15000)
            except PwError:
                pass
            page.wait_for_load_state('domcontentloaded', timeout=10000)
            page.wait_for_timeout(2000)
            page.screenshot(path=str(_SS_DIR / '01_login.png'))

            # 로그인
            rect = page.evaluate("""() => {
                const h = document.getElementById('login-password');
                if (!h) return null;
                let el = h.previousElementSibling;
                while (el) {
                    if (el.tagName === 'INPUT' && el.classList.contains('password-hidden')) {
                        const r = el.getBoundingClientRect();
                        if (r.width > 10) return {x: r.x, y: r.y, w: r.width, h: r.height};
                    }
                    el = el.previousElementSibling;
                }
                return null;
            }""")
            if not rect:
                raise Exception(f"로그인 입력창 없음 ({_SS_DIR}/01_login.png)")

            page.mouse.click(rect['x'] + rect['w'] / 2, rect['y'] + rect['h'] / 2)
            page.wait_for_timeout(200)
            page.keyboard.type(password, delay=30)
            page.wait_for_timeout(300)
            page.locator('#login-btn').click()

            try:
                page.wait_for_url(lambda url: 'login' not in url.lower(), timeout=15000)
            except PwError:
                pass
            page.wait_for_load_state('domcontentloaded', timeout=10000)
            page.wait_for_timeout(5000)
            page.screenshot(path=str(_SS_DIR / '02_dashboard.png'))

            stok = stok_ref[0]
            if not stok:
                m = re.search(r';stok=([a-zA-Z0-9]{8,})', page.url)
                if m:
                    stok = m.group(1)
            if not stok:
                raise Exception(f"stok 없음. URL={page.url}")

            def click_text_btn(keywords, wait_ms=3000):
                result = page.evaluate("""(keywords) => {
                    const tags = 'button, a, li, td, th, span, div[onclick], div[role], p';
                    for (const el of document.querySelectorAll(tags)) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width <= 0 || rect.height <= 0) continue;
                        const ownText = Array.from(el.childNodes)
                            .filter(n => n.nodeType === 3)
                            .map(n => n.textContent.trim())
                            .join('').toLowerCase();
                        if (!ownText) continue;
                        for (const kw of keywords) {
                            if (ownText.includes(kw)) {
                                try { el.click(); return 'own:' + ownText.slice(0, 40); } catch(e) {}
                            }
                        }
                    }
                    for (const el of document.querySelectorAll(tags)) {
                        const rect = el.getBoundingClientRect();
                        if (rect.width <= 0 || rect.height <= 0) continue;
                        const fullText = (el.textContent || '').trim().toLowerCase();
                        if (!fullText || fullText.length > 40) continue;
                        for (const kw of keywords) {
                            if (fullText.includes(kw)) {
                                try { el.click(); return 'full:' + fullText.slice(0, 40); } catch(e) {}
                            }
                        }
                    }
                    return null;
                }""", [k.lower() for k in keywords])
                page.wait_for_timeout(wait_ms)
                return result

            all_clients = []
            nav_result = []

            # 유선 클라이언트 버튼 클릭 → DOM 테이블 + AES 캡처 둘 다 시도
            r = click_text_btn(['유선 클라이언트', 'wired client', 'wired clients'])
            nav_result.append(f'wired:{r}')
            page.screenshot(path=str(_SS_DIR / '03_wired.png'))

            dom_wired = _read_dom_table(page)
            all_clients.extend(dom_wired)

            aes_wired = _try_extract(page.evaluate("() => window.__capturedAPI || []"))
            all_clients.extend(aes_wired)

            # 무선 클라이언트 버튼 클릭
            page.evaluate("() => { window.__capturedAPI = []; }")
            r = click_text_btn(['무선 클라이언트', 'wireless client', 'wireless clients'])
            nav_result.append(f'wireless:{r}')
            page.screenshot(path=str(_SS_DIR / '04_wireless.png'))

            dom_wireless = _read_dom_table(page)
            all_clients.extend(dom_wireless)

            aes_wireless = _try_extract(page.evaluate("() => window.__capturedAPI || []"))
            all_clients.extend(aes_wireless)

            if all_clients:
                return _dedup(all_clients)

            # 실패: 디버그 정보 저장
            captured_api = page.evaluate("() => window.__capturedAPI || []")
            aes_entries = [e for e in captured_api if e.get('source') == 'aesdecrypt']

            debug_path = _SS_DIR / 'captured.json'
            with open(debug_path, 'w', encoding='utf-8') as f:
                json.dump({
                    'stok': stok[:16],
                    'nav_result': nav_result,
                    'dom_wired_count': len(dom_wired),
                    'dom_wireless_count': len(dom_wireless),
                    'aesdecrypt_count': len(aes_entries),
                    'aes_samples': [e.get('text', '')[:400] for e in aes_entries[:6]],
                }, f, ensure_ascii=False, indent=2)

            raise Exception(
                f"DHCP 클라이언트 없음. stok={stok[:8]}... "
                f"nav={nav_result} "
                f"DOM유선={len(dom_wired)}개 DOM무선={len(dom_wireless)}개 "
                f"AES={len(aes_entries)}개 "
                f"전체={debug_path}"
            )

        finally:
            browser.close()


@router.post("/clients", response_model=List[RouterClient])
async def fetch_router_clients(payload: RouterImportRequest):
    try:
        loop = asyncio.get_event_loop()
        clients = await loop.run_in_executor(
            None, _scrape_tplink, payload.password, payload.url
        )
        return clients
    except HTTPException:
        raise
    except Exception as e:
        detail = str(e) if str(e) else f"{type(e).__name__} (백엔드 터미널 로그 확인)"
        raise HTTPException(status_code=500, detail=detail)
