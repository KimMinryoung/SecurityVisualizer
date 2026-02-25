VULN_RULES = [
    {
        "match": ["windows 10", "win10"],
        "device_types": None,
        "vulns": [
            {"cve_id": "CVE-2021-34527", "title": "PrintNightmare (Print Spooler RCE)", "severity": "critical", "description": "Windows Print Spooler 원격 코드 실행 취약점. 인증된 사용자가 임의 코드를 SYSTEM 권한으로 실행 가능."},
            {"cve_id": "CVE-2022-30190", "title": "Follina (MSDT RCE)", "severity": "high", "description": "Microsoft Support Diagnostic Tool 원격 코드 실행. Office 문서 열람만으로 트리거 가능."},
            {"cve_id": "CVE-2021-36942", "title": "PetitPotam (NTLM Relay)", "severity": "high", "description": "LSARPC를 통한 NTLM 인증 강제 유도. AD CS 환경에서 도메인 장악 가능."},
            {"cve_id": "CVE-2023-28252", "title": "CLFS 드라이버 권한 상승", "severity": "high", "description": "Common Log File System 드라이버의 Use-After-Free. 로컬 SYSTEM 권한 획득."},
            {"cve_id": "CVE-2024-21412", "title": "SmartScreen 보안 우회", "severity": "high", "description": "인터넷 바로가기 파일을 통한 SmartScreen 필터 우회. 악성 파일 실행 유도."},
        ],
    },
    {
        "match": ["windows 11"],
        "device_types": None,
        "vulns": [
            {"cve_id": "CVE-2024-21412", "title": "SmartScreen 보안 우회", "severity": "high", "description": "인터넷 바로가기 파일을 통한 SmartScreen 필터 우회."},
            {"cve_id": "CVE-2023-28252", "title": "CLFS 드라이버 권한 상승", "severity": "high", "description": "Common Log File System 드라이버 Use-After-Free. 로컬 SYSTEM 권한 획득."},
            {"cve_id": "CVE-2024-38193", "title": "AFD.sys 커널 권한 상승", "severity": "high", "description": "Ancillary Function Driver Use-After-Free. SYSTEM 권한 상승."},
        ],
    },
    {
        "match": ["windows server 2022"],
        "device_types": None,
        "vulns": [
            {"cve_id": "CVE-2022-26923", "title": "AD CS 도메인 권한 상승 (Certifried)", "severity": "critical", "description": "Active Directory 인증서 서비스의 잘못된 속성 처리로 도메인 컨트롤러 권한 획득 가능."},
            {"cve_id": "CVE-2023-23397", "title": "Outlook NTLM 해시 유출", "severity": "critical", "description": "특수 제작된 이메일 수신만으로 NTLM 자격증명 유출. 사용자 상호작용 불필요."},
            {"cve_id": "CVE-2021-34527", "title": "PrintNightmare (Print Spooler RCE)", "severity": "critical", "description": "Windows Print Spooler 원격 코드 실행. SYSTEM 권한으로 임의 코드 실행 가능."},
        ],
    },
    {
        "match": ["windows server 2019"],
        "device_types": None,
        "vulns": [
            {"cve_id": "CVE-2021-34527", "title": "PrintNightmare (Print Spooler RCE)", "severity": "critical", "description": "Windows Print Spooler 원격 코드 실행."},
            {"cve_id": "CVE-2022-26923", "title": "AD CS 도메인 권한 상승 (Certifried)", "severity": "critical", "description": "AD CS 잘못된 속성 처리로 도메인 컨트롤러 권한 획득."},
            {"cve_id": "CVE-2023-23397", "title": "Outlook NTLM 해시 유출", "severity": "critical", "description": "특수 이메일 수신만으로 NTLM 자격증명 유출."},
            {"cve_id": "CVE-2021-36942", "title": "PetitPotam (NTLM Relay)", "severity": "high", "description": "LSARPC 통한 NTLM 인증 강제 유도."},
        ],
    },
    {
        "match": ["windows server 2016", "windows server 2012"],
        "device_types": None,
        "vulns": [
            {"cve_id": "CVE-2017-0144", "title": "EternalBlue (SMB RCE)", "severity": "critical", "description": "SMBv1 원격 코드 실행. WannaCry/NotPetya 랜섬웨어에 활용된 취약점."},
            {"cve_id": "CVE-2019-0708", "title": "BlueKeep (RDP RCE)", "severity": "critical", "description": "원격 데스크톱 서비스 원격 코드 실행. 인증 없이 SYSTEM 권한 획득 가능."},
            {"cve_id": "CVE-2021-34527", "title": "PrintNightmare (Print Spooler RCE)", "severity": "critical", "description": "Windows Print Spooler 원격 코드 실행."},
            {"cve_id": "CVE-2020-1472", "title": "Zerologon (Netlogon 권한 상승)", "severity": "critical", "description": "Netlogon 프로토콜 암호화 결함. 도메인 컨트롤러 비밀번호 초기화 가능."},
        ],
    },
    {
        "match": ["ubuntu", "debian"],
        "device_types": None,
        "vulns": [
            {"cve_id": "CVE-2022-0847", "title": "Dirty Pipe (커널 파이프 권한 상승)", "severity": "high", "description": "Linux 커널 파이프 버퍼 쓰기 취약점. 읽기 전용 파일 덮어쓰기 및 root 권한 획득."},
            {"cve_id": "CVE-2023-4911", "title": "Looney Tunables (glibc 권한 상승)", "severity": "high", "description": "glibc의 GLIBC_TUNABLES 환경변수 파싱 버퍼 오버플로우. 로컬 root 권한 획득."},
            {"cve_id": "CVE-2021-4034", "title": "PwnKit (pkexec 권한 상승)", "severity": "high", "description": "Polkit pkexec의 로컬 권한 상승. 12년간 존재한 취약점으로 광범위하게 영향."},
            {"cve_id": "CVE-2024-1086", "title": "netfilter Use-After-Free (커널 권한 상승)", "severity": "high", "description": "Linux netfilter nf_tables의 UAF. 컨테이너 탈출 및 root 권한 획득."},
        ],
    },
    {
        "match": ["centos", "rhel", "red hat"],
        "device_types": None,
        "vulns": [
            {"cve_id": "CVE-2022-0847", "title": "Dirty Pipe (커널 파이프 권한 상승)", "severity": "high", "description": "Linux 커널 파이프 버퍼 쓰기 취약점. root 권한 획득."},
            {"cve_id": "CVE-2021-4034", "title": "PwnKit (pkexec 권한 상승)", "severity": "high", "description": "Polkit pkexec 로컬 권한 상승."},
            {"cve_id": "CVE-2023-4911", "title": "Looney Tunables (glibc 권한 상승)", "severity": "high", "description": "glibc GLIBC_TUNABLES 버퍼 오버플로우."},
            {"cve_id": "CVE-2022-2588", "title": "cls_route Use-After-Free (커널 권한 상승)", "severity": "high", "description": "Linux 커널 net/sched/cls_route.c UAF. 로컬 권한 상승."},
        ],
    },
    {
        "match": ["cisco ios xe", "ios xe"],
        "device_types": None,
        "vulns": [
            {"cve_id": "CVE-2023-20198", "title": "IOS XE 웹 UI 권한 상승 (RCE)", "severity": "critical", "description": "Cisco IOS XE 웹 UI의 미인증 권한 상승. 공격자가 관리자 계정 생성 가능. CVSS 10.0."},
            {"cve_id": "CVE-2023-20273", "title": "IOS XE 웹 UI RCE (후속 체인)", "severity": "high", "description": "CVE-2023-20198과 함께 체인 공격으로 루트 권한 코드 실행."},
            {"cve_id": "CVE-2021-1609", "title": "IOS XE 웹 관리 RCE", "severity": "critical", "description": "웹 관리 인터페이스의 미인증 원격 코드 실행."},
        ],
    },
    {
        "match": ["cisco ios"],
        "device_types": ["router", "switch"],
        "vulns": [
            {"cve_id": "CVE-2017-6736", "title": "Cisco IOS SNMP RCE", "severity": "critical", "description": "SNMP 서브시스템의 원격 코드 실행. SNMP v1/v2c/v3 모두 영향."},
            {"cve_id": "CVE-2018-0171", "title": "Cisco Smart Install RCE", "severity": "critical", "description": "Smart Install 기능의 미인증 원격 코드 실행. 전 세계 수십만 장비 영향."},
        ],
    },
    {
        "match": ["fortios", "fortigate"],
        "device_types": None,
        "vulns": [
            {"cve_id": "CVE-2022-40684", "title": "FortiOS/FortiProxy 인증 우회", "severity": "critical", "description": "HTTP/HTTPS 관리 인터페이스 인증 우회. 미인증 공격자가 관리자 작업 수행 가능. CVSS 9.8."},
            {"cve_id": "CVE-2023-27997", "title": "FortiOS SSL-VPN Heap 오버플로우 (RCE)", "severity": "critical", "description": "SSL-VPN 사전 인증 힙 오버플로우. 원격 코드 실행 가능. CVSS 9.8."},
            {"cve_id": "CVE-2024-21762", "title": "FortiOS SSL-VPN Out-of-Bounds Write (RCE)", "severity": "critical", "description": "SSL-VPN의 OOB 쓰기 취약점. 미인증 원격 코드 실행. 실제 공격에 활용됨."},
        ],
    },
    {
        "match": ["palo alto", "pan-os", "panos"],
        "device_types": None,
        "vulns": [
            {"cve_id": "CVE-2024-3400", "title": "PAN-OS GlobalProtect RCE", "severity": "critical", "description": "GlobalProtect 게이트웨이의 OS 명령 인젝션. 미인증 원격 루트 코드 실행. CVSS 10.0."},
            {"cve_id": "CVE-2020-2021", "title": "PAN-OS SAML 인증 우회", "severity": "critical", "description": "SAML 인증 활성화 시 미인증 접근 허용. CVSS 10.0."},
        ],
    },
    {
        "match": ["macos", "mac os", "os x"],
        "device_types": None,
        "vulns": [
            {"cve_id": "CVE-2021-30807", "title": "IOMobileFrameBuffer 커널 권한 상승", "severity": "critical", "description": "IOMobileFrameBuffer의 메모리 손상. 커널 권한으로 임의 코드 실행. 실제 공격 확인."},
            {"cve_id": "CVE-2023-41993", "title": "WebKit 원격 코드 실행 (Safari)", "severity": "high", "description": "WebKit의 타입 혼동 취약점. 악성 웹 콘텐츠로 임의 코드 실행. 실제 공격 확인."},
            {"cve_id": "CVE-2023-41064", "title": "ImageIO 버퍼 오버플로우 (RCE)", "severity": "critical", "description": "악성 이미지 처리 시 원격 코드 실행. NSO Group Pegasus 스파이웨어에 활용."},
        ],
    },
]
