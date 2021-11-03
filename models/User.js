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
    images: {
        type: [
            {
                url: String,
                filename: String
            }
        ],
        required: true
    },
    profileDescription: {
        type: String,
        required: true
    },
    dob: {
        type: Date,
        min: '1900-01-01',
        max: '2050-12-31',
        required: true
    },
    gender: {
        type: String,
        enum: ['male', 'female'],
        required: true
    },
    genderPreference: {
        type: String,
        enum: ['male', 'female'],
        required: true
    },
    ageRange: {
        type: String,
        enum: ['maxgap_5', 'maxgap_10', 'maxgap_20'],
        required: true
    },
    dates: [
        {
            type: Schema.Types.ObjectId,
            ref: "Date"
        }
    ],
    sentRequests: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    friendRequests: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    geometry: {
        type: {
            type: String,
            enum: ['Point'],
            required: true
        },
        coordinates: {
            type: [Number],
            required: true
        }
    }
});
userSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model("User", userSchema);