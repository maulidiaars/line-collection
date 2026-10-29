'use strict';
const { requireAuth, requireAdmin } = require('./lib/security');
module.exports = { requireAuth, requireAdmin };
