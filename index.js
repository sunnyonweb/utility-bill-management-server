// server/index.js
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// --- JWT Verification Middleware ---
const verifyToken = (req, res, next) => {
    const authorizationHeader = req.headers.authorization;
    if (!authorizationHeader) {
        return res.status(401).send({ message: 'Unauthorized access: No token provided' });
    }
    const token = authorizationHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            console.error('Token verification error:', err);
            return res.status(401).send({ message: 'Unauthorized access: Invalid token' });
        }
        req.decoded = decoded; 
        next();
    });
};

// Function to connect to MongoDB
const uri = "mongodb+srv://utility-bill-management:vpvCjaUq3ipxlTRu@cluster0.6ve5zji.mongodb.net/?appName=Cluster0";

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Basic Test Route
app.get('/', (req, res) => {
    res.send('Utility Bill Management Server is running!');
});

async function run() {
    try {
        await client.connect();
        const db = client.db('utility_bill');
        const billsCollection = db.collection('bills');
        const myBillsCollection = db.collection('myBills');
        const usersCollection = db.collection('users');

        // --- PUBLIC BILLS ENDPOINTS ---

        app.get('/bills/recent', async (req, res) => {
            try {
                const cursor = billsCollection.find({}).sort({ date: -1 }).limit(6); 
                const result = await cursor.toArray();
                res.status(200).send(result);
            } catch (error) {
                console.error('Error fetching recent bills:', error);
                res.status(500).send({ message: 'Failed to fetch recent bills.' });
            }
        });

        app.get('/bills', async (req, res) => {
            const { category } = req.query;
            const query = category ? { category: category } : {};

            try {
                const cursor = billsCollection.find(query);
                const result = await cursor.toArray();
                res.status(200).send(result);
            } catch (error) {
                console.error('Error fetching bills:', error);
                res.status(500).send({ message: 'Failed to fetch bills.' });
            }
        });

        app.get('/bills/:id', async (req, res) => {
            const id = req.params.id;
            try {
                const query = { _id: new ObjectId(id) };
                const result = await billsCollection.findOne(query);

                if (!result) return res.status(404).send({ message: 'Bill not found.' });
                res.status(200).send(result);
            } catch (error) {
                res.status(400).send({ message: 'Invalid Bill ID format.' });
            }
        });

        app.post('/bills', async (req, res) => {
            const newBill = req.body;
            
            if (newBill.date) {
                newBill.date = new Date(newBill.date);
            }
            const result = await billsCollection.insertOne(newBill);
            res.status(201).send({ ...result, insertedId: result.insertedId });
        });
        
        app.post('/my-bills', async (req, res) => {
            const paidBill = req.body;
            
            if (!paidBill.email || !paidBill.billId || !paidBill.amount) {
                return res.status(400).send({ message: 'Missing mandatory fields for payment.' });
            }

            try {
                paidBill.billId = new ObjectId(paidBill.billId);
            } catch (e) {
                return res.status(400).send({ message: 'Invalid Bill ID provided.' });
            }
            
            const result = await myBillsCollection.insertOne(paidBill);
            res.status(201).send({ ...result, insertedId: result.insertedId });
        });

        // --- PRIVATE MY BILLS ENDPOINTS (SECURED) ---
        
        app.get('/my-bills/:email', verifyToken, async (req, res) => {
            const userEmail = req.params.email;
            
            if (userEmail !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden access: You can only view your own records.' });
            }

            const query = { email: userEmail };

            try {
                const cursor = myBillsCollection.find(query);
                const result = await cursor.toArray();
                res.status(200).send(result);
            } catch (error) {
                console.error('Error fetching paid bills for user:', error);
                res.status(500).send({ message: 'Failed to fetch user paid bills.' });
            }
        });

        app.patch('/my-bills/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const { amount, address, phone, date } = req.body;
            
            try {
                const query = { _id: new ObjectId(id) };
                const existingBill = await myBillsCollection.findOne(query);
                if (!existingBill) return res.status(404).send({ message: 'Paid bill record not found.' });
                
                if (existingBill.email !== req.decoded.email) {
                    return res.status(403).send({ message: 'Forbidden access: You can only update your own records.' });
                }

                const updateDoc = {
                    $set: { amount, address, phone, date: new Date(date) }
                };
                
                const result = await myBillsCollection.updateOne(query, updateDoc);
                
                res.status(200).send({ message: 'Paid bill updated successfully.', modifiedCount: result.modifiedCount });
            } catch (error) {
                res.status(400).send({ message: 'Invalid ID or data provided.' });
            }
        });

        app.delete('/my-bills/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            try {
                const query = { _id: new ObjectId(id) };
                const existingBill = await myBillsCollection.findOne(query);
                if (!existingBill) return res.status(404).send({ message: 'Paid bill record not found.' });
                
                if (existingBill.email !== req.decoded.email) {
                    return res.status(403).send({ message: 'Forbidden access: You can only delete your own records.' });
                }

                const result = await myBillsCollection.deleteOne(query);

                res.status(200).send({ message: 'Paid bill record deleted successfully.' });
            } catch (error) {
                res.status(400).send({ message: 'Invalid ID format.' });
            }
        });

        // --- AUTHENTICATION ENDPOINTS ---

        app.post('/users', async (req, res) => {
            const user = req.body;
            const existingUser = await usersCollection.findOne({ email: user.email });
            if (existingUser) {
                return res.status(200).send({ message: 'User already exists', insertedId: existingUser._id });
            }
            
            const result = await usersCollection.insertOne(user);
            res.status(201).send({ ...result, insertedId: result.insertedId });
        });

        app.post('/jwt', async (req, res) => {
            const user = req.body;
            
            try {
                if (!user || !user.email) {
                    return res.status(400).send({ message: 'Email required for JWT generation.' });
                }
                if (!process.env.ACCESS_TOKEN_SECRET) {
                    console.error("FATAL: ACCESS_TOKEN_SECRET is not set in environment variables.");
                    return res.status(500).send({ message: 'Server configuration error (JWT secret missing).' });
                }
                
                const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
                res.send({ token });

            } catch (error) {
                console.error("JWT SIGNING FAILED (500 Error Cause):", error.message);
                res.status(500).send({ message: 'Failed to generate token on server. Check server console.' });
            }
        });

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        
    }
}
run().catch(console.dir);


app.listen(port, () => {
    console.log(`utility bill server is running on port: ${port}`)
})