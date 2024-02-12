import express from 'express'
import bodyParser from 'body-parser';
import session from 'express-session'
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import { nanoid } from 'nanoid';

const app = express();
const PORT = 8080;

app.set('view engine', 'pug');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static('css'));
app.use(session({
    secret: "SECRET",
    resave: true,
    saveUninitialized: true
}));

const prisma = new PrismaClient()

// BASIC NAV ROUTES
app.get('/', async(req, res) => {
    if (!req.session.user) return res.redirect('/login')

    let posts = await prisma.posts.findMany({ include: { user: true, comments: true, likes: true } });
    console.log(posts[0])

    res.render('index', { user: req.session.user, posts })
});

// AUTH ROUTES
app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('login');
});

app.get('/signup', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('signup');
});

app.post('/login', async(req, res) => {
    if (!req.body.email || !req.body.password) {
        return res.render('login', { message: 'Please fill out all required fields' })
    }

    // find user if exists
    let user = await prisma.users.findFirst({
        where: {
            email: req.body.email
        }
    });

    // if user exists, then try to log in based on password provided
    if (user) {
        let correctPassword = await bcrypt.compare(req.body.password, user.password_hash);

        if (correctPassword) {
            req.session.user = user;
            res.cookie('userid', user.id, { maxAge: 900000 })
            return res.redirect('/')
        } else {
            return res.render('login', { message: "Invalid email / password combination" })
        }
    }

    return res.render('login', { message: "Invalid email / password combination" })
});

app.post('/signup', async(req, res) => {
    if (req.body.password != req.body['repeat-password']) return res.render('signup', {message: 'Both password fields must match'})

    console.log(req.body)

    bcrypt.hash(req.body.password, 10, async(err, hash) => {
        if (err) return res.render('signup', {message: err})
        let password_hash = hash;
        let createdUser = await prisma.users.create({
            data: {
                id: nanoid(),
                username: req.body.username,
                email: req.body.email,
                password_hash: password_hash
            }
        })

        req.session.user = createdUser;
        res.cookie('userid', req.session.user.id, { maxAge: 900000 })
        return res.redirect('/')
    })
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.clearCookie('userid');
    return res.redirect('/login');
});

// POST ROUTES
app.post('/posts', async(req, res) => {
    if (!req.session.user) return res.redirect('/login');

    await prisma.posts.create({
        data: {
            id: nanoid(),
            title: req.body.title,
            content: req.body.content,
            user_id: req.session.user.id
        }
    })

    return res.redirect('/')
});

// LIKE ROUTES
app.post('/likes/:post_id', async(req, res) => { 
    if (!req.session.user) return res.redirect('/login')

    let like_exists = await prisma.likes.findFirst({
        where: {
            user_id: req.session.user.id,
            post_id: req.params.post_id
        }
    });

    if (like_exists) {
        await prisma.likes.delete({
            where: {
                id: like_exists.id
            }
        })
    } else {
        await prisma.likes.create({
            data: {
                id: nanoid(),
                user_id: req.session.user.id,
                post_id: req.params.post_id
            }
        });

    }

    return res.redirect('/')
});

app.listen(PORT, () => console.log('Server listening at http://localhost:' + PORT));