require("dotenv").config();
const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();

app.use(cors());

app.use(express.json());

const port = process.env.PORT || 5000;

// const uri = `mongodb+srv://${process.env.db_user}:${process.env.db_password}@cluster0.sdyx3bs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const uri = "mongodb://localhost:27017";

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const database = await client.db("diagnostic_center");
    const userCollection = database.collection("users");
    const bannerCollection = database.collection("banner");

    // middleware for verify token
    const verifyToken = (req, res, next) => {
      const token = req.headers.authorization.split(' ')[1]
      
      if (!token) {
        return res.status(401).send({ message: "unauthorize access denied" });
      }

      jwt.verify(token, process.env.secret_token, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "unauthorize access denied" });
        }

        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async(req, res, next) => {
      const email = req?.decoded?.email
      
      const query = {email: email}

      const admin = await userCollection.findOne(query)

      if(!admin){
        return res.status(403).send({ message: "forbidden access" });
      }

      if(admin.role!== 'admin') return res.status(403).send({ message: "forbidden access" });

      next();
    }

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.secret_token, {
        expiresIn: "24h",
      });
      res.send({ token });
    });

    app.post("/signup", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };

      const existingUser = await userCollection.findOne(query);
      if (existingUser) return res.send({ message: "user already exists" });

      const data = await userCollection.insertOne(user);
      console.log(data);
      res.send(data);
    });

    app.get('/admin/:email', verifyToken, async (req, res) => {
      const {email} = req.params;
      
      // if(email !== req?.decoded?.email) return res.status(403).send({message: 'forbidden access'})

        const data = await userCollection.findOne({email: email})
        
        res.send(data);

    })

    app.get('/user/:email', verifyToken, async (req, res) => {
      const {email} = req.params;
      
      // if(email!== req?.decoded?.email) return res.status(403).send({message: 'forbidden access'})
        const data = await userCollection.findOne({email: email})
        
        res.send(data)
        
    })

    app.post('/add_banner', verifyToken, verifyAdmin, async(req,res) => { 
      const banner = req.body;
      
      const result = await bannerCollection.insertOne(banner)
      res.send(result)
    })

    app.get('/banners',verifyToken, verifyAdmin, async(req,res) => {
      const pagination = req.query

      const currentPage = Number(pagination.currentPage) || 1;
      const pageSize = Number(pagination.pageSize) || 10;
      const totalData = (currentPage - 1) * pageSize

      console.log(totalData)
      const data = await bannerCollection.find({}).skip(totalData).limit(pageSize).toArray()
      res.send(data)
    })

    app.patch('/activate_banner',verifyToken, verifyAdmin, async(req,res) => {
      const bannerId = req.body.bannerId;
      console.log(bannerId)

      await bannerCollection.updateMany({}, {$set: {isActive: false}});

      const result = await bannerCollection.updateOne(
        { _id: new ObjectId(bannerId) },
        { $set: { isActive: true } }
      );
      console.log(result)
      res.send(result);
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

app.listen(port, () =>
  console.log(`server is running at http://localhost:${port}`)
);
