const express = require("express");
const router = express.Router();
const { isLoggedIn } = require("../middleware.js");
const WrapAsync = require('../utils/WrapAsync');
const UserModel = require("../models/User");
const DateModel = require("../models/Date");

router.post("/accept/:dateID", isLoggedIn, WrapAsync(async (req, res) => {
    const date = await DateModel.findById(req.params.dateID);
    date.status = "accepted";
    await date.save();
    req.flash("success", "You have a new date!");
    res.redirect("/dashboard");
}))

router.post("/reject/:dateID", isLoggedIn, WrapAsync(async (req, res) => {
    const date = await DateModel.findById(req.params.dateID);
    await UserModel.findOneAndUpdate(
        { _id: date.sender._id },
        { $pull: { dates: req.params.dateID } }
    );
    await UserModel.findOneAndUpdate(
        { _id: date.receiver._id },
        { $pull: { dates: req.params.dateID } }
    );
    await DateModel.findOneAndDelete({ _id: req.params.dateID });
    req.flash("info", "Rejected the date request");
    res.redirect("/dashboard");
}))

router.post("/:recipient", isLoggedIn, WrapAsync(async (req, res) => {
    const date = new DateModel({ sender: req.user._id, receiver: req.params.recipient, status: "pending", location: req.body.location, date: req.body.dod });
    await date.save();
    await UserModel.findOneAndUpdate({ _id: req.user._id }, { $push: { dates: date._id } });
    await UserModel.findOneAndUpdate({ _id: req.params.recipient }, { $push: { dates: date._id } });
    req.flash("success", "Sent a date request!");
    res.redirect("/dashboard");
}))

router.get("/:recipient", isLoggedIn, WrapAsync(async (req, res) => {
    const recipient = await UserModel.findById(req.params.recipient);
    res.render("dateScheduler.ejs", { recipient });
}))

module.exports = router;