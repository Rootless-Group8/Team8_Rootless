const mongoose = require('mongoose');

const RELOCATION_GOALS = [
  'tourist_visit',
  'work',
  'short_term_stay',
  'long_term_residency',
  'permanent_move',
];

const profileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // one profile per user account
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: 50,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: 50,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address'],
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      // Accepts optional leading + and 7-15 digits (E.164-ish)
      match: [/^\+?[0-9]{7,15}$/, 'Please enter a valid phone number'],
    },
    citizenship: {
      type: String,
      required: [true, 'Citizenship/passport country is required'],
      trim: true,
    },
    currentCountry: {
      type: String,
      required: [true, 'Current country is required'],
      trim: true,
    },
    destinationCountry: {
      type: String,
      required: [true, 'Destination country is required'],
      trim: true,
    },
    relocationGoal: {
      type: String,
      required: [true, 'Relocation goal is required'],
      enum: {
        values: RELOCATION_GOALS,
        message: 'Relocation goal must be one of: ' + RELOCATION_GOALS.join(', '),
      },
    },
    plannedArrivalDate: {
      type: Date,
      required: [true, 'Planned arrival date is required'],
      validate: {
        validator: function (value) {
          // Arrival date must be today or in the future
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return value >= today;
        },
        message: 'Planned arrival date cannot be in the past',
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Profile', profileSchema);
module.exports.RELOCATION_GOALS = RELOCATION_GOALS;
