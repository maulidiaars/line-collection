'use strict';
// Sai com código 0 se já existe um admin (usado pelo start.bat)
require('dotenv').config({ quiet: true });
const { get } = require('../server/db');
process.exit(get("SELECT COUNT(*) c FROM users WHERE role='admin'").c ? 0 : 1);
