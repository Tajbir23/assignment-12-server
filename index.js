require('dotenv').config()
const express = require('express')
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors')
const app = express();

app.use(cors())

app.use(express.json())

const port = process.env.PORT || 5000;


const uri = `mongodb+srv://${process.env.db_user}:${process.env.db_password}@cluster0.sdyx3bs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const database = await client.db('diagnostic_center');
    const userCollection = database.collection('users');


    app.post('/signup', async (req, res) => {
        const user = req.body
        const query = {email : user.email}

        const existingUser= await userCollection.findOne(query)
        if(existingUser) return res.send({message: 'user already exists'})

        const data = await userCollection.insertOne(user)
        res.send(data)
    })
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => console.log(`server is running at http://localhost:${port}`));
