const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const jwt = require('jsonwebtoken');

const marketPriceRoutes = require('../routes/marketPriceRoutes');
const MarketPrice = require('../models/MarketPrice');
const User = require('../models/User');
const { errorHandler } = require('../middleware/errorHandler');
const config = require('../config/env');

const app = express();
app.use(express.json());
app.use('/api/market', marketPriceRoutes);
app.use(errorHandler);

let mongoServer;

// Increase timeout for the first run so MongoDB binary can be downloaded
jest.setTimeout(600000);

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

afterEach(async () => {
    await MarketPrice.deleteMany();
    await User.deleteMany();
});

describe('Market Price API', () => {
    describe('GET /api/market/prices/latest', () => {
        it('should return empty list if no prices exist and seeding is disabled', async () => {
            const res = await request(app).get('/api/market/prices/latest');
            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBeTruthy();
        });

        it('should return latest verified prices', async () => {
            await MarketPrice.create([
                {
                    cropName: 'wheat',
                    market: 'Lahore Mandi',
                    province: 'Punjab',
                    price: { average: 4000 },
                    isVerified: true,
                    date: new Date('2023-01-01')
                },
                {
                    cropName: 'wheat',
                    market: 'Lahore Mandi',
                    province: 'Punjab',
                    price: { average: 4200 },
                    isVerified: true,
                    date: new Date('2023-01-02') // This is newer
                },
                {
                    cropName: 'wheat',
                    market: 'Lahore Mandi',
                    province: 'Punjab',
                    price: { average: 4500 },
                    isVerified: false, // Not verified, should be ignored
                    date: new Date('2023-01-03') 
                }
            ]);

            const res = await request(app).get('/api/market/prices/latest');
            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBeTruthy();
            
            const data = res.body.data;
            expect(data.length).toBe(1);
            expect(data[0].price.average).toBe(4200);
            expect(data[0].cropName).toBe('wheat');
        });
    });

    describe('GET /api/market/prices', () => {
        it('should fetch prices with pagination', async () => {
            for (let i = 0; i < 15; i++) {
                await MarketPrice.create({
                    cropName: 'cotton',
                    market: 'Multan Mandi',
                    province: 'Punjab',
                    price: { average: 8000 + i },
                    isVerified: true
                });
            }

            const res = await request(app).get('/api/market/prices?limit=10&page=1');
            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBeTruthy();
            expect(res.body.data.prices.length).toBe(10);
            expect(res.body.data.total).toBe(15);
            expect(res.body.data.pages).toBe(2);
        });
    });

    describe('Admin Moderation (Approve, Reject) and Admin-Only Deletion', () => {
        it('should allow user to submit price and view in my-prices, but prevent user from deleting it', async () => {
            const user = await User.create({
                name: 'Farmer John',
                email: 'john@example.com',
                password: 'password123',
                role: 'farmer'
            });
            const userToken = jwt.sign({ id: user._id }, config.JWT_SECRET);

            // User submits a price
            const submitRes = await request(app)
                .post('/api/market/prices')
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    cropName: 'wheat',
                    market: 'Faisalabad Mandi',
                    province: 'Punjab',
                    price: { average: 4100, min: 4000, max: 4200, unit: 'per_40kg' }
                });

            expect(submitRes.statusCode).toBe(201);
            expect(submitRes.body.data.isVerified).toBe(false);
            expect(submitRes.body.data.moderationStatus).toBe('pending');
            const priceId = submitRes.body.data._id;

            // User views their reported prices
            const myPricesRes = await request(app)
                .get('/api/market/my-prices')
                .set('Authorization', `Bearer ${userToken}`);

            expect(myPricesRes.statusCode).toBe(200);
            expect(myPricesRes.body.data.length).toBe(1);
            expect(myPricesRes.body.data[0].market).toBe('Faisalabad Mandi');
            expect(myPricesRes.body.data[0].moderationStatus).toBe('pending');

            // Regular user tries to delete their price -> MUST BE FORBIDDEN (403)
            const deleteRes = await request(app)
                .delete(`/api/market/prices/${priceId}`)
                .set('Authorization', `Bearer ${userToken}`);

            expect(deleteRes.statusCode).toBe(403);
            expect(deleteRes.body.error).toMatch(/admin/i);

            // Verify price was NOT deleted
            const found = await MarketPrice.findById(priceId);
            expect(found).not.toBeNull();
        });

        it('should allow admin to approve a reported price so it shows on the app', async () => {
            const admin = await User.create({
                name: 'Admin User',
                email: 'admin@agrigrow.com',
                password: 'adminpassword',
                role: 'admin'
            });
            const adminToken = jwt.sign({ id: admin._id }, config.JWT_SECRET);

            const user = await User.create({
                name: 'Farmer Ali',
                email: 'ali@example.com',
                password: 'password123',
                role: 'farmer'
            });

            const price = await MarketPrice.create({
                cropName: 'rice',
                market: 'Gujranwala Mandi',
                province: 'Punjab',
                price: { average: 5500, min: 5300, max: 5700, unit: 'per_40kg' },
                source: 'user-contributed',
                submittedBy: user._id,
                isVerified: false,
                moderationStatus: 'pending'
            });

            // Before approval: should not appear in latest verified prices
            const beforeLatest = await request(app).get('/api/market/prices/latest');
            expect(beforeLatest.body.data.length).toBe(0);

            // Admin views moderation queue
            const queueRes = await request(app)
                .get('/api/market/moderation-queue?status=pending')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(queueRes.statusCode).toBe(200);
            expect(queueRes.body.data.length).toBe(1);

            // Admin approves the price
            const approveRes = await request(app)
                .patch(`/api/market/prices/${price._id}/approve`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(approveRes.statusCode).toBe(200);
            expect(approveRes.body.data.isVerified).toBe(true);
            expect(approveRes.body.data.moderationStatus).toBe('approved');

            // After approval: MUST appear in latest verified prices
            const afterLatest = await request(app).get('/api/market/prices/latest');
            expect(afterLatest.body.data.length).toBe(1);
            expect(afterLatest.body.data[0].cropName).toBe('rice');
        });

        it('should allow admin to reject a reported price and delete it if needed', async () => {
            const admin = await User.create({
                name: 'Admin User',
                email: 'admin@agrigrow.com',
                password: 'adminpassword',
                role: 'admin'
            });
            const adminToken = jwt.sign({ id: admin._id }, config.JWT_SECRET);

            const price = await MarketPrice.create({
                cropName: 'maize',
                market: 'Sahiwal Mandi',
                province: 'Punjab',
                price: { average: 2500, min: 2400, max: 2600, unit: 'per_40kg' },
                source: 'user-contributed',
                isVerified: false,
                moderationStatus: 'pending'
            });

            // Admin rejects the price
            const rejectRes = await request(app)
                .patch(`/api/market/prices/${price._id}/reject`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ reason: 'Unrealistic price spike reported' });

            expect(rejectRes.statusCode).toBe(200);
            expect(rejectRes.body.data.isVerified).toBe(false);
            expect(rejectRes.body.data.moderationStatus).toBe('rejected');
            expect(rejectRes.body.data.rejectionReason).toBe('Unrealistic price spike reported');

            // Admin deletes the rejected price
            const deleteRes = await request(app)
                .delete(`/api/market/prices/${price._id}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(deleteRes.statusCode).toBe(200);
            const found = await MarketPrice.findById(price._id);
            expect(found).toBeNull();
        });
    });
});
