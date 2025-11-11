// 🔹 Wake up backend before sending OTP or creating account
fetch("https://student-gpt.onrender.com/ping")
  .then(() => console.log("✅ Backend is awake for signup"))
  .catch(() => console.log("⚠️ Wake-up ping failed (ignore if first load)"));

// 🔹 Send OTP button click handler
document.getElementById("sendOtpBtn").addEventListener("click", async function () {
  const email = document.getElementById("signup-email").value.trim();

  if (!email) {
    alert("Please enter your email first!");
    return;
  }

  try {
    const res = await fetch("https://student-gpt.onrender.com/send-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      const err = await res.text();
      alert("Failed to send OTP: " + err);
      return;
    }

    alert("✅ OTP sent successfully! Check your email.");
  } catch (error) {
    console.error(error);
    alert("Error sending OTP. Please try again later.");
  }
});

// 🔹 Signup form submit handler
document.getElementById("signupForm").addEventListener("submit", async function (e) {
  e.preventDefault();

  const name = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const phone = document.getElementById("signup-phone").value.trim();
  const password = document.getElementById("signup-password").value.trim();
  const confirmPassword = document.getElementById("signup-confirm").value.trim();
  const otp = document.getElementById("signup-otp").value.trim();

  // Validate fields
  if (!name || !email || !phone || !password || !confirmPassword || !otp) {
    alert("Please fill all fields and enter OTP.");
    return;
  }

  if (password !== confirmPassword) {
    alert("Passwords do not match!");
    return;
  }

  try {
    const res = await fetch("https://student-gpt.onrender.com/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone, password, otp }),
    });

    if (!res.ok) {
      const errorMsg = await res.text();
      alert(errorMsg || "Signup failed.");
      return;
    }

    alert("🎉 Signup successful! Please login now.");
    window.location.href = "Login.html";
  } catch (err) {
    console.error(err);
    alert("Error creating account. Please try again later.");
  }
});
