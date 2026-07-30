function requireAdminLogin(req, res, next) {
    if (!req.session.admin) {
        return res.redirect('/admin/login');
    }
    next();
}

module.exports = { requireAdminLogin };
