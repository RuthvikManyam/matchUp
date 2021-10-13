const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");
const Schema = mongoose.Schema;

const userSchema = new Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    city: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    sentRequests: [{
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    }],
    friendRequests: [{
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    }],
    friends: [{
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    }]
});
userSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", userSchema);