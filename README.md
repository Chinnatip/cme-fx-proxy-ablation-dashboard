# CME FX Proxy Ablation Dashboard

เว็บ dashboard สำหรับรีวิวการทดลอง `MR/MOM concept transfer` จากงาน FX paper ไปยังข้อมูล proxy จาก `FX spot + CME currency futures`

## เว็บนี้คืออะไร

โปรเจกต์นี้เป็น static dashboard ที่ใช้ดูผล ablation ของระบบ ranking/backtest โดยเลือกได้ 4 อย่าง:

- `Timeframe`: `1H`, `4H`, `1D`, `1M`
- `Mode`: futures momentum, basis/carry, combined momentum + basis
- `J`: lookback window หรือช่วงย้อนหลังที่ใช้สร้างคะแนน ranking
- `K`: holding window หรือช่วงเวลาที่ถือ position หลังเลือก winner/loser

ใต้ equity chart มี `Signal / Rebalance Tape` สำหรับดูพฤติกรรมของระบบในแต่ละรอบ rebalance ว่าระบบเลือก long/short asset อะไร และรอบนั้นทำกำไรหรือขาดทุนเท่าไร โมเดลนี้ไม่ได้มี take profit / cutloss ราย order โดยตรง จึงแสดงเป็น net return ต่อรอบแทน

ถัดจากนั้นมี `Portfolio Exposure Map` เพื่อดูสัดส่วนพอร์ตตามเวลา โดยตีความ strategy เป็น equal-weight long/short rotation: winner/long = `+50%`, loser/short = `-50%`, และสกุลที่ไม่ได้เลือก = `0%`

จุดสำคัญของรอบนี้คือทุก timeframe ถูกบังคับให้อยู่ใน common window เดียวกันให้มากที่สุด คือประมาณ `Feb 2024` ถึงข้อมูลล่าสุดที่ Yahoo Finance 1H source ให้ได้ เพื่อไม่ให้ daily data ได้เปรียบจาก history ที่ยาวกว่า intraday

## ไฟล์หลัก

- `index.html`: โครงหน้า dashboard
- `styles.css`: สไตล์ dark trading terminal
- `app.js`: logic สำหรับ selector, KPI, equity chart และ J/K matrix
- `data.js`: artifact จาก run จริงในรูปแบบ JavaScript data bundle
- `best_summary.csv`: ตารางสรุป best candidate ต่อ timeframe
- `vercel.json`: config สำหรับ deploy บน Vercel แบบ static
- `.github/workflows/deploy-pages.yml`: workflow สำหรับ deploy ด้วย GitHub Pages

## วิธีรันในเครื่อง

```bash
python3 -m http.server 8777
```

จากนั้นเปิด:

```text
http://127.0.0.1:8777
```

## วิธี deploy

### Vercel

Import repo นี้เข้า Vercel ได้เลย เพราะเป็น static site ไม่มี build step

ค่าที่แนะนำ:

- Framework Preset: `Other`
- Build Command: ว่าง
- Output Directory: `.`

### GitHub Pages

repo นี้มี workflow deploy-pages ติดมาด้วย ถ้าเปิด GitHub Pages แบบ `GitHub Actions` แล้ว push เข้า `main` ระบบจะ publish หน้าเว็บอัตโนมัติ

## ข้อควรระวัง

นี่คือ research dashboard ไม่ใช่ live trading system และ CME futures ในงานนี้เป็น proxy ไม่ใช่ OTC 1M forward ตาม paper ต้นฉบับ ดังนั้นผลลัพธ์ควรใช้เพื่อวิเคราะห์แนวทางต่อ ไม่ควรใช้เป็น trading signal โดยตรง
