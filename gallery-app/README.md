# My Gallery — Apna Photo/Video Gallery Web App

This is a full working web app jisme:
- Login sirf **naam + phone number** se hota hai (koi password nahi)
- Multiple log apna alag-alag account bana sakte hain, har user ko sirf apni photos/videos dikhengi
- Photos aur videos permanently store hote hain (Cloudinary par) — phone ki storage bilkul use nahi hoti
- Mobile aur desktop dono par kaam karta hai
- **Albums** — photos/videos ko categories mein organize kar sakte hain (Family, Trip, etc.)
- **Date-wise grouping** — gallery mein "Today", "Yesterday", aur date ke hisaab se photos group hoti hain
- **Trash/Recycle bin** — delete kiya hua kuch turant nahi hatta, 30 din tak trash mein rehta hai, chahen to restore kar sakte hain
- **Download** — koi bhi photo/video ya multiple ek saath phone mein wapas download kar sakte hain
- **Multi-select** — select mode on karke bulk actions (download, album mein daalna, delete) kar sakte hain
- **Favorites** — kisi bhi photo/video ko star maar ke "Favorites" tab mein alag se dekh sakte hain
- **Storage meter** — topbar mein dikhta hai ki aapki gallery kitni space use kar rahi hai
- **Share link** — koi bhi photo/video ya poora album ka link bana ke kisi ko bhi bhej sakte hain — unhe login karne ki zaroorat nahi, wo seedha browser mein dekh aur download kar sakte hain

App teen free services use karta hai:
| Service | Kaam |
|---|---|
| **MongoDB Atlas** | Users ki list aur har photo/video ki entry (metadata) store karta hai |
| **Cloudinary** | Actual photos/videos store karta hai (free 25GB tak) |
| **Render.com** | App ko internet par live karta hai (free tier) |

Sabhi teeno free hain, koi credit card nahi chahiye.

---

## Step 1 — MongoDB Atlas (database) banayein

1. [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register) par free account banayein
2. "Build a Database" → **M0 Free** cluster choose karein → koi bhi region select karein → Create
3. **Database Access** mein ek user banayein (username + password yaad rakhein)
4. **Network Access** mein "Allow access from anywhere" (0.0.0.0/0) add karein
5. "Connect" → "Drivers" → connection string copy karein, ye kuch aisa dikhega:
   ```
   mongodb+srv://username:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. `<password>` ki jagah apna actual password daalein, aur end mein `/mygallery` add kar dein (database ka naam):
   ```
   mongodb+srv://username:yourpassword@cluster0.xxxxx.mongodb.net/mygallery?retryWrites=true&w=majority
   ```
   Ye pura string aapko `MONGO_URI` ke liye chahiye hoga.

---

## Step 2 — Cloudinary (photo/video storage) banayein

1. [cloudinary.com/users/register/free](https://cloudinary.com/users/register/free) par free account banayein
2. Login karne ke baad Dashboard par hi teen cheezein dikhengi:
   - **Cloud name**
   - **API Key**
   - **API Secret** (yahan "reveal" par click karke dekhein)
3. Ye teeno copy kar lein.

---

## Step 3 — Code apne computer par download karein

Is poore `gallery-app` folder ko download karein, ya GitHub par ek naya repository banake ye sara code push kar dein (Render seedha GitHub se deploy karta hai, wo sabse aasan tareeka hai).

---

## Step 4 — Render.com par deploy karein

1. [render.com](https://render.com) par free account banayein (GitHub se sign up kar sakte hain)
2. "New +" → **Web Service** choose karein
3. Apna GitHub repo connect karein (jahan ye code push kiya tha)
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. "Environment" tab mein ye variables add karein (Step 1 aur 2 se copy kiya hua):

   | Key | Value |
   |---|---|
   | `MONGO_URI` | apna MongoDB connection string |
   | `CLOUDINARY_CLOUD_NAME` | apna cloud name |
   | `CLOUDINARY_API_KEY` | apni api key |
   | `CLOUDINARY_API_SECRET` | apna api secret |
   | `JWT_SECRET` | koi bhi lamba random text, jaise `mySecretGallery2026xyz` |

6. "Create Web Service" par click karein — 2-3 minute mein app live ho jayegi, ek URL milega jaise `https://my-gallery.onrender.com`

Wo URL apne family/friends ko bhej dein — wo apna naam+number daal ke apna alag gallery bana sakte hain.

> **Note:** Render ke free tier par app 15 min inactivity ke baad "sleep" ho jaata hai, aur dobara khulne mein 30-50 second lagta hai. Ye normal hai, free tier ki limitation hai.

---

## Local par test karna ho (deploy karne se pehle)

```bash
npm install
cp .env.example .env
# .env file kholke apni real values daal dein
npm start
```

Phir browser mein `http://localhost:5000` kholein.

---

## Security note

Login sirf naam + phone se hota hai, koi OTP ya password verification nahi hai (jaisa aapne bola tha, simple rakha hai). Iska matlab: agar koi aapka phone number jaan jaaye, wo us number se login karke aapki photos dekh sakta hai. Personal/family use ke liye theek hai, lekin agar future mein zyada security chahiye ho to OTP verification add karwaya ja sakta hai — bata dijiyega.

## Kya aage add karwa sakte hain
- OTP-based login (zyada secure)
- Albums/folders banane ka option
- Photos ko family ke saath share karna
- Search by date
