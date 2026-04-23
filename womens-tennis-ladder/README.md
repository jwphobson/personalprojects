# 🎾 Club Tennis Ladder

A simple real-time tennis ladder app for clubs to manage players, challenges, and match results.

Built as a lightweight web app using Firebase for live data syncing.

---

## 🚀 Features

- 📊 **Live Ladder Standings**  
  Automatically updates rankings based on match results

- ⚔️ **Challenge System**  
  Players can challenge up to **2 positions above**

- 📝 **Match Recording**
  - Challenge matches (affect ladder positions)
  - Friendly matches (stats only)

- 🎯 **Real Tennis Scoring**
  - Best of 2 sets
  - Championship tie-break if needed

- 🔒 **Basic Admin Protection**  
  Prevents random edits to players and ladder

- 📱 **Contact Masking**  
  Phone numbers and emails are partially hidden

- 🔄 **Real-Time Sync**  
  Powered by Firebase Realtime Database

---

## 🧠 How It Works

### Ladder Rules

- Players are ranked by position (#1 = top)
- You can only challenge players above you
- Maximum challenge distance = **2 positions**

### Challenge Outcomes

- If the challenger wins:
  - They take the opponent’s position
  - Everyone in between moves down

- If the challenged player wins:
  - No position changes

---

## 🧮 Scoring Format

Matches are recorded as:

- Set 1
- Set 2
- Championship Tie-Break (if needed)

Example:

    6-4, 3-6, CTB 10-7

---

## 🛠 Tech Stack

- HTML / CSS / JavaScript
- Firebase Realtime Database
- GitHub Pages (hosting)

---

## 🌐 Live App

👉 https://jwphobson.github.io/personalprojects/tennis-ladder/

---

## ⚙️ Setup (Local Development)

    git clone https://github.com/jwphobson/personalprojects.git
    cd personalprojects/tennis-ladder
    open index.html

No build step required.

---

## 🔐 Notes

- This is a lightweight club tool, not a production-grade system
- Admin access is currently basic (email prompt)
- Firebase rules should be configured for proper security

---

## 📌 Future Improvements

- Proper login/authentication
- Player profiles
- Match scheduling
- Notifications (SMS / WhatsApp automation)
- Seasons / resets

---

## 👥 Contributors

- Kyle Martin  
- Jonny Hobson  

---

## 🏁 Summary

A no-nonsense tennis ladder that actually works:

**Challenge. Compete. Climb.**