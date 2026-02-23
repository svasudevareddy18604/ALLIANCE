module.exports = function (req, res, next) {
    if (!req.session || !req.session.dean) {

        // If browser is requesting a page → redirect
        if (req.accepts("html")) {
            return res.redirect("/dean/login");
        }

        // If API / fetch request → JSON
        return res.status(401).json({ error: "Unauthorized" });
    }

    next();
};
