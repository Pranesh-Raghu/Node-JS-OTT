const express = require('express');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const bcrypt = require('bcrypt');
const app = express();

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// MySQL connection setup
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '62145090pranesh',
    database: process.env.DB_NAME || 'comics_tv'
};

const db = mysql.createConnection(dbConfig);

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
    }
    console.log('Connected to MySQL database');
});

// // // MySQL session store setup
const sessionStore = new MySQLStore(dbConfig);

app.use(session({
    secret: process.env.SESSION_SECRET || 'pranesh',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Load and save data functions
function loadData() {
    try {
        const rawData = fs.readFileSync(path.join(__dirname, 'data.json'));
        return JSON.parse(rawData);
    } catch (error) {
        console.error("Error reading data.json:", error);
        return { movies: [], videos: [], users: [], admins: [] };
    }
}
let data = loadData();

function saveData() {
    fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify(data, null, 2));
}


//  Middleware to check admin authentication
function requireAdminLogin(req, res, next) {
    if (!req.session.admin) {
        return res.redirect('/admin/login');
    }
    next();
}

//  Admin Login Page
app.get('/admin/login', (req, res) => {
    res.render('adminLogin', { error: null });
});

//  Handle Admin Login
app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    //  MySQL database to validate admin credentials
    const query = 'SELECT * FROM admins WHERE username = ? AND password = ?';
    db.query(query, [username, password], (err, results) => {
        if (err) {
            return res.render('adminLogin', { error: "An error occurred" });
        }
        if (results.length === 0) {
            return res.render('adminLogin', { error: "Invalid admin credentials" });
        }
        req.session.admin = username;
        res.redirect('/admin');
    });
});

//  Admin Logout Route
app.get('/admin/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/admin/login');
    });
});

//  Admin Page
app.get('/admin', requireAdminLogin, (req, res) => {
    res.render('admin');
});

//  Admin Route to Add Movie
app.post('/admin/add-movie', requireAdminLogin, (req, res) => {
    const { title, releaseDate, poster, cast, crew } = req.body;
    if (!title || !releaseDate || !poster || !cast || !crew) {
        return res.status(400).send('All fields are required');
    }
    try {
        const newMovie = {
            id: (data.movies.length + 1).toString(),
            title,
            releaseDate,
            poster,
            cast: JSON.parse(cast),
            crew: JSON.parse(crew)
        };
        data.movies.push(newMovie);
        saveData();
        res.redirect('/admin');
        console.log("Movie added:", newMovie)
    } catch (error) {
        res.status(400).send('Invalid JSON format for cast or crew');
    }
}); 

//  Admin Route to Upload Video
app.post('/admin/upload-video', requireAdminLogin, (req, res) => {
    const { title, videoLink } = req.body;
    if (!title || !videoLink) {
        return res.status(400).send('Both title and video link are required');
    }
    const newVideo = {
        id: (data.videos.length + 1).toString(),
        title,
        src: videoLink
    };
    data.videos.push(newVideo);
    saveData();
    res.redirect('/admin');
});

//  Route to Home Page
app.get('/', (req, res) => {
    res.render('home', { movies: data.movies, user: req.session.user });
});

//  Route to Movie Details Page
app.get('/movie/:id', (req, res) => {
    const movie = data.movies.find(movie => movie.id === req.params.id);
    if (movie) {
        res.render('movie', { movie, user: req.session.user });
    } else {
        res.status(404).send('Movie not found');
    }
});

//  Route to Video Player Page
app.get('/video/:id', (req, res) => {
    if (!req.session.user) {
        return res.redirect(`/login?redirectTo=/video/${req.params.id}`);
    }

    const video = data.videos.find(video => video.id === req.params.id);
    if (video) {
        res.render('videoPlayer', { video, user: req.session.user });
    } else {
        res.status(404).send('Video not found');
    }
});

//  User Login Page
app.get('/login', (req, res) => {
    res.render('login', { error: null, redirectTo: req.query.redirectTo });
});

//  Handle User Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    const query = 'SELECT * FROM users WHERE username = ?';
    db.query(query, [username], (err, results) => {
        if (err) {
            return res.render('login', { error: "An error occurred", redirectTo: req.body.redirectTo });
        }

        if (results.length === 0) {
            return res.render('login', { error: "Invalid username or password", redirectTo: req.body.redirectTo });
        }

        const user = results[0];

        // Compare hashed password
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err || !isMatch) {
                return res.render('login', { error: "Invalid username or password", redirectTo: req.body.redirectTo });
            }

            // Passwords match
            req.session.user = username;

            if (req.body.redirectTo) {
                return res.redirect(req.body.redirectTo);
            }

            res.redirect('/');
        });
    });
});


//  User Signup Page
app.get('/signup', (req, res) => {
    res.render('signup', { error: null });
});

//  Handle User Signup 
app.post('/signup', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.render('signup', { error: "All fields are required" });
    }

    // Check if the username already exists
    const query = 'SELECT * FROM users WHERE username = ?';
    db.query(query, [username], (err, results) => {
        if (err) {
            return res.render('signup', { error: "An error occurred" });
        }
        if (results.length > 0) {
            return res.render('signup', { error: "Username already exists" });
        }

        // Hash the password before saving
        const saltRounds = 10;
        bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
            if (err) {
                return res.render('signup', { error: "Error while hashing password" });
            }

            const insertQuery = 'INSERT INTO users (username, password) VALUES (?, ?)';
            db.query(insertQuery, [username, hashedPassword], (err, result) => {
                if (err) {
                    return res.render('signup', { error: "An error occurred while saving the user" });
                }

                req.session.user = username; // Log the user in after signup
                res.redirect('/');
            });
        });
    });
});

//  User Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

//  Watchlist Route
app.get('/watchlist', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login?redirectTo=/watchlist');
    }

    res.render('watchlist', { watchlist: req.session.watchlist || [], user: req.session.user });
});

// Start the server
app.listen(1000, () => {
    console.log('Server is running on http://localhost:1000');
});



//  Middleware to check user authentication
// function requireLogin(req, res, next) {
//     if (!req.session.user) {
//         return res.redirect(`/login?redirectTo=${req.originalUrl}`);
//     }
//     next();
// }