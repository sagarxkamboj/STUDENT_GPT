require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const nodemailer = require("nodemailer");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Gemini AI client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const modelId = "gemini-2.5-flash";

// Mongoose User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  password: { type: String, required: true },
});
const User = mongoose.model("User", userSchema);

// Password validation
function validatePassword(password) {
  const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  return pwdRegex.test(password);
}

// Memory stores
const otpStore = {};
const conversationHistories = {};

// Nodemailer configgg
let transporter;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
} else if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
} else {
  console.warn("No SMTP config found. Email features will fail until set.");
}

const CONTACT_TO =
  process.env.CONTACT_TO || process.env.EMAIL_USER || "studentgpt00@gmail.com";

/* ---------------------
   OTP / Signup / Login
   --------------------- */
app.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).send("Email is required");

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { code: otp, expires: Date.now() + 5 * 60 * 1000 };

    if (!transporter) throw new Error("No mail transporter configured");

    await transporter.sendMail({
      from: process.env.SMTP_USER || process.env.EMAIL_USER,
      to: email,
      subject: "StudentGPT Email Verification OTP",
      text: `Your OTP is: ${otp} (valid for 5 minutes). Please dont share your OTPs and personal details with anyone. Our team never call you or message you for OTP. Please be aware of such scams. 
      Best Regards, StudentGPT Team`,
    });

    res.send("OTP sent to your email");
  } catch (err) {
    console.error("OTP Email Error:", err);
    res.status(500).send("Error sending OTP: " + err.message);
  }
});

app.post("/verify-otp", (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp)
      return res.status(400).json({ error: "Email and otp required" });

    const entry = otpStore[email];
    if (!entry) return res.status(400).json({ error: "No OTP requested" });
    if (Date.now() > entry.expires) {
      delete otpStore[email];
      return res.status(400).json({ error: "OTP expired" });
    }
    if (String(entry.code).trim() !== String(otp).trim())
      return res.status(400).json({ error: "Invalid OTP" });

    entry.verified = true;
    delete entry.code;
    return res.json({ verified: true, message: "OTP verified" });
  } catch (err) {
    console.error("verify-otp error:", err);
    return res.status(500).json({ error: "verify-otp failed" });
  }
});

app.post("/signup", async (req, res) => {
  try {
    const { name, email, phone, password, otp } = req.body;
    if (!name || !email || !password)
      return res.status(400).send("Missing required fields");

    if (!validatePassword(password)) {
      return res
        .status(400)
        .send(
          "Password must include uppercase, lowercase, number, special char, min 8 length."
        );
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).send("Email already registered");

    const otpData = otpStore[email];
    const verified = (otpData && otpData.verified) === true;
    if (!verified) return res.status(400).send("Invalid or expired OTP");

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await new User({
      name,
      email,
      phone,
      password: hashedPassword,
    }).save();

    delete otpStore[email];

    if (transporter) {
      transporter
        .sendMail({
          from: process.env.SMTP_USER || process.env.EMAIL_USER,
          to: email,
          subject: "🎉 Welcome to StudentGPT – Your AI Study Partner",
          text: `Hey ${name},  

A huge welcome to **StudentGPT**! 🎓✨  
You’ve just joined a growing community of students who believe learning can be smart, fast, and fun.  

Here’s what makes StudentGPT special for you:  
1️⃣ **Assignments made easy** – No more late-night stress, get clear explanations & guidance.  
2️⃣ **Code Debugging** – Stuck on an error? StudentGPT will help you fix and understand it.  
3️⃣ **Exam Prep** – Revise topics quickly with summaries, Q&A, and study hacks.  
4️⃣ **Project Assistance** – From brainstorming ideas to building logic, we’ve got your back.  
5️⃣ **Productivity Boost** – Learn faster, save time, and focus on what really matters.  

💡 *Pro Tip*: Just ask your questions naturally, like you’re chatting with a friend – StudentGPT is designed to talk in a GenZ-friendly way, so no boring textbook vibes.  

This AI was built with ❤️ and countless hours of effort by **Sagar Kamboj**, an engineering student just like you – who knows the struggles of assignments, exams, and deadlines.  

🚀 What’s Next?  
- Start exploring right away, don’t hesitate to throw in your toughest questions.  
- Use it daily – the more you interact, the smarter your learning journey gets.  
- Share it with your friends so they can also level up their studies.  

We’re super excited to be part of your learning journey.  
Remember: With StudentGPT, you’re never studying alone. 💯  

Stay curious, keep hustling, and let’s make education easier together!  

Cheers,  
Team StudentGPT 💙  
(Developed by Sagar Kamboj)  
`,
        })
        .catch((mailErr) => console.error("Welcome email error:", mailErr));
    }

    res
      .status(201)
      .json({ message: "Account created successfully", email: user.email });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).send("Error creating account");
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).send("Missing credentials");

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).send("Invalid credentials");

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).send("Invalid credentials");

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.json({ token, name: user.name, email: user.email });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Server error");
  }
});

/* ---------------------
   Password Reset
   --------------------- */
app.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).send("Email is required");

  const user = await User.findOne({ email });
  if (!user) return res.status(404).send("No account with this email");

  try {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { code: otp, expires: Date.now() + 5 * 60 * 1000 };

    if (!transporter) throw new Error("No mail transporter configured");

    await transporter.sendMail({
      from: process.env.SMTP_USER || process.env.EMAIL_USER,
      to: email,
      subject: "StudentGPT Password Reset Code",
      text: `Your OTP to reset password is: ${otp} (valid for 5 minutes)`,
    });

    res.send("Password reset OTP sent");
  } catch (err) {
    console.error("Forgot Password Email Error:", err);
    res.status(500).send("Error sending reset OTP");
  }
});

app.post("/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword)
    return res.status(400).send("Missing fields");

  if (!validatePassword(newPassword)) {
    return res.status(400).send("Weak password format");
  }

  const otpData = otpStore[email];
  if (!otpData || otpData.code !== otp || Date.now() > otpData.expires) {
    return res.status(400).send("Invalid or expired OTP");
  }

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send("No account with this email");

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    delete otpStore[email];
    res.send("Password reset successful!");
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).send("Error resetting password");
  }
});

/* ---------------------
   Auth Middleware
   --------------------- */
function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).send("Unauthorized: No token");

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).send("Forbidden: Invalid token");
    req.user = user;
    next();
  });
}

/* ---------------------
   Chatbot API
   --------------------- */
app.post("/chatbot-api-endpoint", authMiddleware, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).send("Message is required");

    const userId = req.user.userId;
    if (!conversationHistories[userId]) {
      conversationHistories[userId] = [
        {
          role: "system",
          content: `You are StudentGPT, an AI assistant developed by **Sagar Kamboj**.  
- Always mention your developer is **Sagar Kamboj**.  
- Purpose: help students with assignments, coding, debugging, projects, and exams.  
- Be friendly, clear, and professional.
- Before starting a chat if user say hii you always ask hii what is your name and then greet with their name.
- Also never mention again and again the developer name be friendly and helpful.
- behave like a genz personality.
- whenever user is closing the chat say "Goodbye! If you have more questions, feel free to ask. Happy studying!"`,
        },
      ];
    }

    conversationHistories[userId].push({ role: "user", content: message });

    const model = genAI.getGenerativeModel({ model: modelId });
    const fullConversation = conversationHistories[userId]
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const result = await model.generateContent(fullConversation);
    const botResponse =
      (result.response && result.response.text && result.response.text()) ||
      result.output?.[0]?.content?.[0]?.text ||
      "No response received.";

    conversationHistories[userId].push({
      role: "assistant",
      content: botResponse,
    });
    res.json({ response: botResponse });
  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).send("Error generating chatbot response");
  }
});

/* ---------------------
   Contact Form
   --------------------- */
app.post("/api/contact", async (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !email || !message)
    return res.status(400).json({ ok: false, error: "Missing fields" });

  if (!transporter)
    return res
      .status(500)
      .json({ ok: false, error: "Mail transporter not configured" });

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER || process.env.SMTP_USER, // FIXED sender
      to: CONTACT_TO,
      subject: `📩 New contact form message from ${name}`,
      text: `You got a new message from your website contact form:\n\n
Name: ${name}\n
Email: ${email}\n
Message:\n${message}`,
      replyTo: email, // reply user ko direct
    });

    return res.json({ ok: true, message: "Message sent successfully ✅" });
  } catch (err) {
    console.error("Contact send error:", err);
    return res.status(500).json({ ok: false, error: "Failed to send" });
  }
});

/* ---------------------
   Start Server
   --------------------- */
const PORT = process.env.PORT || 4000;
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    app.listen(PORT, () =>
      console.log(`✅ Server running on http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("DB connection error:", err);
  });
