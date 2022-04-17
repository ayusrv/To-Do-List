if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const app = express();
const TodoTask = require("./models/task");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user");
const flash = require("connect-flash");
const path = require("path");
const catchAsync = require("./views/utils/catchasync");
const ExpressError = require("./views/utils/expressError");
const { isLoggedIn } = require("./middleware");

const dbUrl =
  "mongodb+srv://ayush:ayush@cluster0.84xsf.mongodb.net/todo-list?retryWrites=true&w=majority";
mongoose.connect(dbUrl, {
  useNewUrlParser: true,
  useCreateIndex: true,
  useUnifiedTopology: true,
  useFindAndModify: false,
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
  console.log("Database connected");
});

app.set("view engine", "ejs");

app.set("views", path.join(__dirname, "views"));

app.use("/static", express.static("public"));

app.use(express.urlencoded({ extended: true }));

const sessionConfig = {
  secret: "thisshouldbeasecret",
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
};
app.use(cookieParser("thisismysecret"));
app.use(session(sessionConfig));
app.use(flash());

//for login and register basically passport uses

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});

//home router
app.get("/", (req, res) => {
  res.render("todo/home");
});

// login route
app.get("/signin", (req, res) => {
  res.render("user/signin");
});

// login post route for authentication
app.post(
  "/signin",
  passport.authenticate("local", {
    failureFlash: true,
    failureRedirect: "/signin",
  }),
  (req, res) => {
    const username = req.user.username.toUpperCase();
    // req.flash('success',`Welcome  ${username}`);
    const redirectUrl = req.session.returnTo || "/todo";
    delete req.session.returnTo;
    res.redirect("/todo");
  }
);

//Register route
app.get("/signup", (req, res) => {
  res.render("user/signup");
});

//registering a user
app.post(
  "/signup",
  catchAsync(async (req, res, next) => {
    try {
      const { email, username, password } = req.body;
      const user = new User({ email, username });
      const regUser = await User.register(user, password);
      req.login(regUser, (err) => {
        if (err) return next(err);
        req.flash("success", "Welcome to TodoList");
        res.redirect("/todo");
      });
    } catch (e) {
      req.flash("error", e.message);
      res.redirect("/signin");
    }
  })
);
// to fetch all todos from the db
app.get(
  "/todo",
  isLoggedIn,
  catchAsync(async (req, res) => {
    let total_todos = 0;
    const username = req.user.username;
    await TodoTask.countDocuments({ author: username }, function (err, count) {
      if (err) {
        console.log(err);
        total_todos = 0;
      } else {
        total_todos = count;
      }
    });
    await TodoTask.find({ author: username }, (err, tasks) => {
      if (err) return res.status(500).send(err);

      res.render("todo/todo.ejs", { todoTasks: tasks, total_todos, username });
    });
  })
);

//create a new todo
app.post(
  "/new",
  isLoggedIn,
  catchAsync(async (req, res) => {
    const content = req.body.content;
    const author = req.user.username;
    if (content.trim() != 0) {
      const todoTask = new TodoTask({
        author,
        content,
      });
      try {
        await todoTask.save();
        res.redirect("/todo");
      } catch (err) {
        return res.status(500).send(err);
        res.redirect("/todo");
      }
    }
  })
);

//update the existing todo
app.post(
  "/edit/:id",
  isLoggedIn,
  catchAsync(async (req, res) => {
    const id = req.params.id;
    await TodoTask.findByIdAndUpdate(
      id,
      { content: req.body.content },
      (err) => {
        if (err) return res.status(500).send(err);
        res.redirect("/todo");
      }
    );
  })
);

//remove a todo if exists
app.get(
  "/remove/:id",
  isLoggedIn,
  catchAsync(async (req, res) => {
    const id = req.params.id;
    await TodoTask.findByIdAndRemove(id, (err) => {
      if (err) return res.status(500).send(err);
      res.redirect("/todo");
    });
  })
);

//remove all todos
app.post(
  "/removeall",
  isLoggedIn,
  catchAsync(async (req, res) => {
    const author = req.user.username;
    await TodoTask.deleteMany({ author });
    res.redirect("/todo");
  })
);

app.get("/signout", isLoggedIn, (req, res) => {
  req.logout();
  req.flash("success", "Logged out");
  res.redirect("/");
});

app.all("*", (req, res, next) => {
  next(new ExpressError("Page Not Found", 404));
});

app.use((err, req, res, next) => {
  const { statusCode = 500 } = err;
  if (!err.message) err.message = "Oh No, Something Went Wrong!";
  res.status(statusCode).render("error", { err });
});
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`serving on port ${port}`);
});
