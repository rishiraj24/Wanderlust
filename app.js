if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

/* 🔹 DNS fix for Render + MongoDB Atlas */
require("dns").setDefaultResultOrder("ipv4first");

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");

const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");

/* 🔹 USE ONLY ONE ENV VARIABLE */
const dbUrl = process.env.ATLASDB_URL;

/* ❌ Safety check */
if (!dbUrl) {
  throw new Error("MONGODB_URI is not defined in environment variables");
}

/* -------------------- APP CONFIG -------------------- */

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", ejsMate);

app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));

/* -------------------- DATABASE -------------------- */

async function main() {
  await mongoose.connect(dbUrl);
  console.log("✅ Connected to MongoDB");
}

main().catch((err) => {
  console.error("❌ MongoDB connection error:", err);
});

/* -------------------- SESSION STORE -------------------- */

const store = MongoStore.create({
  mongoUrl: dbUrl,
  crypto: {
    secret: process.env.SECRET,
  },
  touchAfter: 24 * 3600,
});

store.on("error", (err) => {
  console.error("❌ ERROR IN MONGO SESSION STORE:", err);
});

const sessionOptions = {
  store,
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
};

app.use(session(sessionOptions));
app.use(flash());

/* -------------------- PASSPORT -------------------- */

app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

/* 🔹 GLOBAL TEMPLATE VARIABLES (FIXES currUser ERROR) */
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user || null;
  next();
});

/* -------------------- ROUTES -------------------- */

/* Root route - redirect to listings (MUST come before userRouter) */
app.get("/", (req, res) => {
  res.redirect("/listings");
});

/* User routes (login, signup, logout) - mount at root */
app.use("/", userRouter);

app.use("/listings", listingRouter);
app.use("/listings/:id/reviews", reviewRouter);

/* -------------------- ERROR HANDLING -------------------- */

app.all("*", (req, res, next) => {
  next(new ExpressError(404, "Page Not Found"));
});

app.use((err, req, res, next) => {
  const { statusCode = 500, message = "Something went wrong!" } = err;
  res.status(statusCode).render("error.ejs", { err });
});

/* -------------------- SERVER -------------------- */

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
