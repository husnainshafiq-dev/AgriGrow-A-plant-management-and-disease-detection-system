const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const jwt = require('jsonwebtoken');

const adminRoutes = require('../routes/adminRoutes');
const blogRoutes = require('../routes/blogRoutes');
const forumRoutes = require('../routes/forumRoutes');
const User = require('../models/User');
const Question = require('../models/Question');
const Advisory = require('../models/Advisory');
const { BlogPost } = require('../models/BlogPost');
const { errorHandler } = require('../middleware/errorHandler');
const config = require('../config/env');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);
app.use('/api/blog', blogRoutes);
app.use('/api/forum', forumRoutes);
app.use(errorHandler);

let mongoServer;

jest.setTimeout(60000);

const createToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role, email: user.email },
        config.JWT_SECRET || 'testsecret',
        { expiresIn: '1d' }
    );
};

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

afterEach(async () => {
    await User.deleteMany();
    await Question.deleteMany();
    await Advisory.deleteMany();
    await BlogPost.deleteMany();
});

describe('Hierarchical RBAC Tests', () => {
    let superadmin, admin, editor, farmer;
    let superadminToken, adminToken, editorToken, farmerToken;

    beforeEach(async () => {
        superadmin = await User.create({
            name: 'Super Admin',
            email: 'super@example.com',
            password: 'Password123!',
            role: 'superadmin',
        });
        admin = await User.create({
            name: 'Regular Admin',
            email: 'admin@example.com',
            password: 'Password123!',
            role: 'admin',
        });
        editor = await User.create({
            name: 'Content Editor',
            email: 'editor@example.com',
            password: 'Password123!',
            role: 'editor',
        });
        farmer = await User.create({
            name: 'Local Farmer',
            email: 'farmer@example.com',
            password: 'Password123!',
            role: 'farmer',
        });

        superadminToken = createToken(superadmin);
        adminToken = createToken(admin);
        editorToken = createToken(editor);
        farmerToken = createToken(farmer);
    });

    describe('Superadmin Privileges', () => {
        it('can create users of any role including admin and superadmin', async () => {
            const res = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({
                    name: 'New Admin',
                    email: 'newadmin@example.com',
                    password: 'Password123!',
                    role: 'admin',
                });
            expect(res.statusCode).toBe(201);
            expect(res.body.data.user.role).toBe('admin');
        });

        it('can promote a farmer to editor, admin, or superadmin', async () => {
            const res = await request(app)
                .patch(`/api/admin/users/${farmer._id}`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({ role: 'admin' });
            expect(res.statusCode).toBe(200);
            expect(res.body.data.user.role).toBe('admin');
        });

        it('can delete another admin user', async () => {
            const res = await request(app)
                .delete(`/api/admin/users/${admin._id}`)
                .set('Authorization', `Bearer ${superadminToken}`);
            expect(res.statusCode).toBe(200);
            const found = await User.findById(admin._id);
            expect(found).toBeNull();
        });

        it('cannot delete own account', async () => {
            const res = await request(app)
                .delete(`/api/admin/users/${superadmin._id}`)
                .set('Authorization', `Bearer ${superadminToken}`);
            expect(res.statusCode).toBe(400);
        });

        it('cannot demote self if sole superadmin', async () => {
            const res = await request(app)
                .patch(`/api/admin/users/${superadmin._id}`)
                .set('Authorization', `Bearer ${superadminToken}`)
                .send({ role: 'admin' });
            expect(res.statusCode).toBe(400);
        });
    });

    describe('Admin Privileges & Restrictions', () => {
        it('can create a farmer or editor', async () => {
            const res = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Another Editor',
                    email: 'anothereditor@example.com',
                    password: 'Password123!',
                    role: 'editor',
                });
            expect(res.statusCode).toBe(201);
            expect(res.body.data.user.role).toBe('editor');
        });

        it('cannot create an admin or superadmin account (403)', async () => {
            const res = await request(app)
                .post('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Rogue Admin',
                    email: 'rogueadmin@example.com',
                    password: 'Password123!',
                    role: 'admin',
                });
            expect(res.statusCode).toBe(403);
        });

        it('can promote/demote between farmer and editor', async () => {
            const res = await request(app)
                .patch(`/api/admin/users/${farmer._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'editor' });
            expect(res.statusCode).toBe(200);
            expect(res.body.data.user.role).toBe('editor');
        });

        it('cannot promote a user to admin or superadmin (403)', async () => {
            const res = await request(app)
                .patch(`/api/admin/users/${farmer._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'admin' });
            expect(res.statusCode).toBe(403);
        });

        it('cannot modify superadmin or other admin accounts (403)', async () => {
            const resSuper = await request(app)
                .patch(`/api/admin/users/${superadmin._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ isActive: false });
            expect(resSuper.statusCode).toBe(403);

            const otherAdmin = await User.create({
                name: 'Other Admin',
                email: 'otheradmin@example.com',
                password: 'Password123!',
                role: 'admin',
            });
            const resAdmin = await request(app)
                .patch(`/api/admin/users/${otherAdmin._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ isActive: false });
            expect(resAdmin.statusCode).toBe(403);
        });

        it('cannot delete superadmin or other admin accounts (403)', async () => {
            const resSuper = await request(app)
                .delete(`/api/admin/users/${superadmin._id}`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect(resSuper.statusCode).toBe(403);

            const otherAdmin = await User.create({
                name: 'Other Admin',
                email: 'otheradmin2@example.com',
                password: 'Password123!',
                role: 'admin',
            });
            const resAdmin = await request(app)
                .delete(`/api/admin/users/${otherAdmin._id}`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect(resAdmin.statusCode).toBe(403);
        });

        it('can delete farmer and editor users', async () => {
            const res = await request(app)
                .delete(`/api/admin/users/${farmer._id}`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.statusCode).toBe(200);
            expect(await User.findById(farmer._id)).toBeNull();
        });
    });

    describe('Editor Privileges & Restrictions', () => {
        it('cannot access user management (403)', async () => {
            const res = await request(app)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${editorToken}`);
            expect(res.statusCode).toBe(403);
        });

        it('can view, add, edit, and moderate queries', async () => {
            // Add query
            const createRes = await request(app)
                .post('/api/admin/queries')
                .set('Authorization', `Bearer ${editorToken}`)
                .send({
                    type: 'question',
                    title: 'Tomato Blight Management',
                    body: 'How to manage early blight in humid weather?',
                    category: 'disease',
                });
            expect(createRes.statusCode).toBe(201);
            const queryId = createRes.body.data.query._id;

            // Edit query
            const editRes = await request(app)
                .patch(`/api/admin/queries/${queryId}`)
                .set('Authorization', `Bearer ${editorToken}`)
                .send({
                    type: 'question',
                    title: 'Tomato Early Blight Guide',
                    status: 'resolved',
                    kept: true,
                });
            expect(editRes.statusCode).toBe(200);
            expect(editRes.body.data.query.title).toBe('Tomato Early Blight Guide');
        });

        it('can approve, reject, and edit blog posts', async () => {
            const post = await BlogPost.create({
                title: 'Guide to Organic Fertilizers',
                slug: 'guide-to-organic-fertilizers',
                content: 'Organic fertilizers improve soil texture and retain moisture effectively.',
                authorName: 'Farmer Ali',
                submitterEmail: 'ali@example.com',
                status: 'pending',
            });

            // Approve post
            const approveRes = await request(app)
                .patch(`/api/blog/admin/posts/${post._id}`)
                .set('Authorization', `Bearer ${editorToken}`)
                .send({ status: 'approved' });
            expect(approveRes.statusCode).toBe(200);
            expect(approveRes.body.data.post.status).toBe('approved');

            // Reject post
            const rejectRes = await request(app)
                .patch(`/api/blog/admin/posts/${post._id}`)
                .set('Authorization', `Bearer ${editorToken}`)
                .send({ status: 'rejected' });
            expect(rejectRes.statusCode).toBe(200);
            expect(rejectRes.body.data.post.status).toBe('rejected');
        });
    });

    describe('Farmer Restrictions', () => {
        it('cannot access any admin or moderation routes (403)', async () => {
            const res1 = await request(app)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${farmerToken}`);
            expect(res1.statusCode).toBe(403);

            const res2 = await request(app)
                .get('/api/admin/queries')
                .set('Authorization', `Bearer ${farmerToken}`);
            expect(res2.statusCode).toBe(403);

            const res3 = await request(app)
                .get('/api/blog/admin/posts')
                .set('Authorization', `Bearer ${farmerToken}`);
            expect(res3.statusCode).toBe(403);
        });
    });
});
