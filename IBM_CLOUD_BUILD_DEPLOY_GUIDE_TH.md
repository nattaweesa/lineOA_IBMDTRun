# วิธี Build และ Deploy LineOA_IBMDTRun ไป IBM Cloud

เอกสารนี้เป็นคู่มือหลักสำหรับ agent ทุกตัวที่ต้อง deploy project นี้

## 1. Project

Source code:

```text
/Users/Nattawee.S/LineOA_IBMDTRun
```

Deploy script หลัก:

```text
/Users/Nattawee.S/LineOA_IBMDTRun/scripts/deploy-ibm-lineoa.sh
```

Deploy wizard ที่ควรใช้:

```text
/Users/Nattawee.S/LineOA_IBMDTRun/scripts/deploy-wizard.sh
```

Deploy doctor สำหรับตรวจปัญหา DNS/VPN/network:

```text
/Users/Nattawee.S/LineOA_IBMDTRun/scripts/deploy-doctor.sh
```

## 2. IBM Cloud Target

```text
Region: jp-tok
Cluster ID: d6a48ret0nfuv0acrpfg
Kubernetes namespace: sandbox-oxdash
Registry: icr.io
Registry namespace: sandbox-oxdash
App name: lineoa-ibmdtrun
Image: icr.io/sandbox-oxdash/lineoa-ibmdtrun:prod
```

Public host:

```text
lineoa-ibmdtrun-sandbox-oxdash.mycluster-jp-tok-1-bx2-4x-a8fd6d2a2463aad636c736bb6b7a13a1-0000.jp-tok.containers.appdomain.cloud
```

## 3. กฎ VPN ที่ต้องจำ

ห้ามสลับเอง ให้ยึดเป็น 2 phase:

```text
Phase A: Public IBM Cloud / Registry = VPN OFF
Phase B: Kubernetes private API = VPN ON
```

จำง่าย:

```text
login / cr login / build-push = VPN OFF
kubeconfig / deploy-app / verify = VPN ON
```

ก่อน Phase A ถ้า public IBM endpoints แกว่ง ให้ตั้ง DNS เป็น:

```text
1.1.1.1
8.8.8.8
```

บน Mac:

```sh
sudo networksetup -setdnsservers Wi-Fi 1.1.1.1 8.8.8.8
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
```

ตรวจ DNS:

```sh
networksetup -getdnsservers Wi-Fi
```

กลับไปใช้ DNS automatic:

```sh
sudo networksetup -setdnsservers Wi-Fi Empty
```

## 4. วิธี Deploy แบบแนะนำ

ใช้ wizard แทนการคิด step เอง

ก่อนเริ่ม deploy ให้รัน doctor ก่อน:

```sh
cd /Users/Nattawee.S/LineOA_IBMDTRun
./scripts/deploy-doctor.sh
```

ถ้าจะเช็คเฉพาะ Phase A:

```sh
./scripts/deploy-doctor.sh public
```

ถ้าจะเช็คเฉพาะ Phase B:

```sh
./scripts/deploy-doctor.sh private
```

### Phase A: VPN OFF

ปิด VPN ก่อน แล้วรัน:

```sh
cd /Users/Nattawee.S/LineOA_IBMDTRun
./scripts/deploy-wizard.sh phase-a
```

Wizard จะทำ:

1. เช็ค public endpoints:
   - `https://iam.cloud.ibm.com`
   - `https://accounts.cloud.ibm.com/v1/accounts`
   - `https://icr.io/v2/`
2. `ibmcloud login --sso`
3. `ibmcloud target -r jp-tok`
4. `ibmcloud cr region-set global`
5. `ibmcloud cr login`
6. `./scripts/deploy-ibm-lineoa.sh build-push`

ถ้า public endpoint timeout ให้หยุดที่ Phase A ก่อน
อย่าเปิด VPN เพื่อแก้มั่ว ๆ
ให้แก้ DNS/network ก่อน โดยเฉพาะ DNS `1.1.1.1 / 8.8.8.8`

### Phase B: VPN ON

หลัง Phase A สำเร็จแล้ว ค่อยเปิด VPN แล้วรัน:

```sh
cd /Users/Nattawee.S/LineOA_IBMDTRun
./scripts/deploy-wizard.sh phase-b
```

Wizard จะทำ:

1. `ibmcloud ks cluster config --cluster d6a48ret0nfuv0acrpfg --endpoint private`
2. เช็ค `kubectl get pods -n sandbox-oxdash`
3. `./scripts/deploy-ibm-lineoa.sh deploy-app`
4. `./scripts/deploy-ibm-lineoa.sh verify`

## 5. Exact Manual Commands

ถ้าไม่ใช้ wizard ให้ใช้ชุดนี้เท่านั้น

### VPN OFF

```sh
cd /Users/Nattawee.S/LineOA_IBMDTRun
ibmcloud login --sso
ibmcloud target -r jp-tok
ibmcloud cr region-set global
ibmcloud cr login
./scripts/deploy-ibm-lineoa.sh build-push
```

### VPN ON

```sh
cd /Users/Nattawee.S/LineOA_IBMDTRun
ibmcloud ks cluster config --cluster d6a48ret0nfuv0acrpfg --endpoint private
./scripts/deploy-ibm-lineoa.sh deploy-app
./scripts/deploy-ibm-lineoa.sh verify
```

## 6. Preflight Commands

เช็ค public endpoints ตอน VPN OFF:

```sh
./scripts/deploy-wizard.sh preflight-public
```

ผลที่ดีคือไม่ timeout

- IAM อาจได้ `200`
- ACCOUNTS อาจได้ `401`
- ICR มักได้ `401`

`401` ใน preflight ไม่ใช่ปัญหา แปลว่า route ถึงแล้วแต่ยังไม่ได้ auth

เช็ค Kubernetes private endpoint ตอน VPN ON:

```sh
./scripts/deploy-wizard.sh preflight-private
```

ดูสถานะ:

```sh
./scripts/deploy-wizard.sh status
```

## 7. Troubleshooting

### `ibmcloud login --sso` ค้างที่ Retrieving accounts

ยังอยู่ Phase A ดังนั้น VPN ต้อง OFF

แปลว่า `accounts.cloud.ibm.com` timeout หรือ public IBM endpoint แกว่ง

ให้ลอง:

```sh
./scripts/deploy-doctor.sh public
```

ถ้า timeout:

- เปลี่ยน Wi-Fi / hotspot
- ใช้ True network ถ้า AIS มีปัญหา
- ตั้ง DNS เป็น `1.1.1.1 / 8.8.8.8`
- flush DNS:

```sh
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
```

แล้ว retry Phase A

### `icr.io` timeout

ยังอยู่ Phase A และ VPN ต้อง OFF

แก้ network ให้ `https://icr.io/v2/` ตอบก่อน
ถ้าได้ `401` ถือว่าผ่าน

### `kubectl get pods` timeout

อันนี้เป็น Phase B ต้องเปิด VPN

เช็ค:

```sh
kubectl config view --minify
```

ถ้า server เป็น private endpoint ต้องเปิด VPN เสมอ

### ห้ามทำ

- ห้ามเปิด VPN ระหว่าง `build-push` ถ้าทำให้ `icr.io` timeout
- ห้ามแก้ manifest ถ้าปัญหาจริงคือ network timeout
- ห้ามเปลี่ยน kubeconfig เป็น IP ตรง ๆ ถ้ายังไม่ได้ backup

## 8. Mental Model

```text
Phase A:
Mac -> public IBM Cloud APIs -> ICR
ใช้ VPN OFF

Phase B:
Mac -> VPN -> private Kubernetes API
ใช้ VPN ON

Runtime:
Browser -> Public ALB -> Ingress -> Service -> Pod
ไม่จำเป็นต้อง VPN
```
