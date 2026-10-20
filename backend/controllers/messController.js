const Mess = require('../models/Mess');
const User = require('../models/User');
const Menu = require('../models/Menu');

// Fields that must never be set directly from a request body
const PROTECTED_MESS_FIELDS = ['owner', 'isApproved', 'rating', 'subscriberCount', '_id', 'createdAt', 'updatedAt'];
const stripFields = (body, fields) => {
  const clean = { ...body };
  fields.forEach(f => delete clean[f]);
  return clean;
};
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @desc   Create mess
// @route  POST /api/messes
// @access Owner
const createMess = async (req, res) => {
  try {
    const existing = await Mess.findOne({ owner: req.user._id });
    if (existing) {
      return res.status(400).json({ success: false, message: 'You already have a mess profile' });
    }

    const mess = await Mess.create({ ...stripFields(req.body, PROTECTED_MESS_FIELDS), owner: req.user._id });
    res.status(201).json({ success: true, mess });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc   Get all messes
// @route  GET /api/messes
// @access Public
const getAllMesses = async (req, res) => {
  try {
    const { search, city, isVeg, mealType, minRating, page = 1, limit = 12, sort = '-createdAt' } = req.query;
    const query = { isApproved: true, isActive: true };

    if (search) query.$text = { $search: search };
    if (city) query['location.city'] = { $regex: escapeRegex(city), $options: 'i' };
    if (isVeg === 'true') query.isVeg = true;
    if (mealType) query.mealTypes = mealType;
    if (minRating) query['rating.average'] = { $gte: parseFloat(minRating) };

    const messes = await Mess.find(query)
      .populate('owner', 'name email')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Mess.countDocuments(query);

    res.json({ success: true, messes, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc   Get single mess
// @route  GET /api/messes/:id
// @access Public
const getMess = async (req, res) => {
  try {
    const mess = await Mess.findById(req.params.id).populate('owner', 'name email phone');
    if (!mess) return res.status(404).json({ success: false, message: 'Mess not found' });
    res.json({ success: true, mess });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc   Get owner's mess
// @route  GET /api/messes/my-mess
// @access Owner
const getMyMess = async (req, res) => {
  try {
    const mess = await Mess.findOne({ owner: req.user._id }).populate('owner', 'name email');
    res.json({ success: true, mess });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc   Update mess
// @route  PUT /api/messes/:id
// @access Owner/Admin
const updateMess = async (req, res) => {
  try {
    let mess = await Mess.findById(req.params.id);
    if (!mess) return res.status(404).json({ success: false, message: 'Mess not found' });

    // Only owner or admin can update
    if (req.user.role !== 'admin' && mess.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Owners cannot approve their own mess, change ownership or tamper with ratings
    const updates = req.user.role === 'admin'
      ? stripFields(req.body, ['owner', 'rating', 'subscriberCount', '_id'])
      : stripFields(req.body, PROTECTED_MESS_FIELDS);
    mess = await Mess.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    res.json({ success: true, mess });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc   Admin approve mess
// @route  PUT /api/messes/:id/approve
// @access Admin
const approveMess = async (req, res) => {
  try {
    const { isApproved } = req.body;
    const mess = await Mess.findByIdAndUpdate(req.params.id, { isApproved }, { new: true });
    if (!mess) return res.status(404).json({ success: false, message: 'Mess not found' });

    // Notify owner
    await User.findByIdAndUpdate(mess.owner, {
      $push: {
        notifications: {
          message: isApproved
            ? `Your mess "${mess.name}" has been approved!`
            : `Your mess "${mess.name}" approval was revoked. Please contact admin.`
        }
      }
    });

    res.json({ success: true, mess });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc   Delete mess
// @route  DELETE /api/messes/:id
// @access Admin
const deleteMess = async (req, res) => {
  try {
    const mess = await Mess.findByIdAndDelete(req.params.id);
    if (!mess) return res.status(404).json({ success: false, message: 'Mess not found' });
    res.json({ success: true, message: 'Mess deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc   Get all messes (admin - includes unapproved)
// @route  GET /api/messes/admin/all
// @access Admin
const getAllMessesAdmin = async (req, res) => {
  try {
    const messes = await Mess.find()
      .populate('owner', 'name email phone')
      .sort('-createdAt');
    res.json({ success: true, messes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { createMess, getAllMesses, getMess, getMyMess, updateMess, approveMess, deleteMess, getAllMessesAdmin };
