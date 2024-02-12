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

    res.render('index', { user: req.session.user, posts: posts.reverse() })
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
    if (!req.session.user) return res.set('HX-Redirect', '/login').send();

    let new_post_id = nanoid()

    await prisma.posts.create({
        data: {
            id: new_post_id,
            title: req.body.title,
            content: req.body.content,
            user_id: req.session.user.id
        }
    })

    let post = await prisma.posts.findFirst({
        where: {
            id: new_post_id
        },
        include: {
            user: true,
            likes: true,
            comments: true
        }
    })

    let response = `
        <article id="post-${post.id}">
            <hgroup>
                <h6>${ post.title }</h6>
                <p>${ post.user.username }</p>
            </hgroup>
            <p>${ post.content }</p>
            <footer class="post-controls">
                <div hx-post=/likes/${ post.id } hx-swap="innerHTML transition:true" class="post-controls-inner">
                    <button><i class="fa-solid fa-heart"></i></button>
                    <p>${ post.likes.length }</p>
                </div>
                <div class="post-controls-inner">
                    <i class="fa-solid fa-comment"></i>
                    <p>${ post.comments.length }</p>
                </div>
                <div hx-get=/posts/${post.id}/edit hx-swap="outerHTML transition:true" hx-target=#post-${post.id} data-tooltip="Edit">
                    <button><i class='fa-solid fa-pen'></i></button>
                </div>
                <div class="post-controls-inner" hx-delete=/posts/${post.id} hx-swap="outerHTML transition:true" hx-target=#post-${post.id}>
                    <button>
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </footer>
        </article>
    `

    return res.send(response);
});

app.get('/posts/:post_id', async(req, res) => {
    let post = await prisma.posts.findFirst({
        where: {
            id: req.params.post_id
        },
        include: {
            user: true,
            likes: true,
            comments: true
        }
    });

    let response = `
        <article id="post-${post.id}">
            <hgroup>
                <h6>${ post.title }</h6>
                <p>${ post.user.username }</p>
            </hgroup>
            <p>${ post.content }</p>
            <footer class="post-controls">
                <div hx-post=/likes/${ post.id } hx-swap="innerHTML transition:true" class="post-controls-inner">
                    <button><i class="fa-solid fa-heart"></i></button>
                    <p>${ post.likes.length }</p>
                </div>
                <div class="post-controls-inner">
                    <i class="fa-solid fa-comment"></i>
                    <p>${ post.comments.length }</p>
                </div>
                <div hx-get=/posts/${post.id}/edit hx-swap="outerHTML transition:true" hx-target=#post-${post.id} data-tooltip="Edit">
                    <button><i class='fa-solid fa-pen'></i></button>
                </div>
                <div class="post-controls-inner" hx-delete=/posts/${post.id} hx-swap="outerHTML transition:true" hx-target=#post-${post.id}>
                    <button>
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </footer>
        </article>
    `

    res.send(response)
});

app.get('/posts/:post_id/edit', async(req, res) => {
    let post = await prisma.posts.findFirst({
        where: {
            id: req.params.post_id
        }
    });

    let response = `
        <article id='post-${post.id}'>
            <form hx-put='/posts/${post.id}' hx-swap='outerHTML transition:true' hx-target='#post-${post.id}'>
                <input type='text' value='${post.title}' name='title' placeholder='Title' />
                <textarea rows='4' name='content' placeholder='Content'>${post.content}</textarea>
                <div role='group'>
                    <button class='secondary' hx-get='/posts/${post.id}' hx-swap='outerHTML transition:true' hx-target='#post-${post.id}'>Cancel</button>
                    <button type='submit'>Confirm</button>
                </div>
            </form>
        </article>
    `

    return res.send(response);
});

app.delete('/posts/:post_id', async(req, res) => {
    if (!req.session.user) return res.set("HX-Redirect", "/login").send()
    let post_to_delete = await prisma.posts.findFirst({
        where: {
            id: req.params.post_id
        }
    });

    if (req.session.user.id != post_to_delete.user_id) return res.send("Nice try buddy, but this ain't yours!");

    await prisma.posts.delete({
        where: {
            id: req.params.post_id
        }
    })

    return res.send()
});

app.put('/posts/:post_id', async(req, res) => {
    await prisma.posts.update({
        where: {
            id: req.params.post_id
        },
        data: {
            title: req.body.title,
            content: req.body.content
        }
    })

    let post = await prisma.posts.findFirst({
        where: {
            id: req.params.post_id
        },
        include: {
            user: true,
            likes: true,
            comments: true
        }
    });

    let response = `
        <article id="post-${post.id}">
            <hgroup>
                <h6>${ post.title }</h6>
                <p>${ post.user.username }</p>
            </hgroup>
            <p>${ post.content }</p>
            <footer class="post-controls">
                <div hx-post=/likes/${ post.id } hx-swap="innerHTML transition:true" class="post-controls-inner">
                    <button><i class="fa-solid fa-heart"></i></button>
                    <p>${ post.likes.length }</p>
                </div>
                <div class="post-controls-inner">
                    <i class="fa-solid fa-comment"></i>
                    <p>${ post.comments.length }</p>
                </div>
                <div hx-get=/posts/${post.id}/edit hx-swap="outerHTML transition:true" hx-target=#post-${post.id} data-tooltip="Edit">
                    <button><i class='fa-solid fa-pen'></i></button>
                </div>
                <div class="post-controls-inner" hx-delete=/posts/${post.id} hx-swap="outerHTML transition:true" hx-target=#post-${post.id}>
                    <button>
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </footer>
        </article>
    `

    return res.send(response);
});

// LIKE ROUTES
app.post('/likes/:post_id', async(req, res) => { 
    if (!req.session.user) return res.set("HX-Redirect", "/login").send()

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

    let curr_post = await prisma.posts.findFirst({
        where: {
            id: req.params.post_id
        },
        include: {
            likes: true
        }
    });

    let response = `<button><i class='fa-solid fa-heart'></i></button> <p>${curr_post.likes.length}</p>`

    return res.send(response)
});

app.listen(PORT, () => console.log('Server listening at http://localhost:' + PORT));