require("dotenv").config();
const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
const stripe = require("stripe")(process.env.stripe_secret);

//Must remove "/" from your production URL
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://assignment12.tajbirideas.com"
    ]
  })
);

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
    const testCollection = database.collection("test");
    const appointmentCollection = database.collection("appointment");
    const cancelAppointmentCollection = database.collection("cancelAppointment");
    const recommendationCollection = database.collection("recommendation");

    // middleware for verify token
    const verifyToken = (req, res, next) => {
      const token = req.headers?.authorization?.split(" ")[1];

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

    const verifyAdmin = async (req, res, next) => {
      const email = req?.decoded?.email;

      const query = { email: email };

      const admin = await userCollection.findOne(query);

      if (!admin) {
        return res.status(403).send({ message: "forbidden access" });
      }

      if (admin.role !== "admin")
        return res.status(403).send({ message: "forbidden access" });

      next();
    };

    app.get('/', async (req, res) =>{
      res.send("hello world")
    })

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

    app.get("/admin/:email", verifyToken, async (req, res) => {
      const { email } = req.params;

      // if(email !== req?.decoded?.email) return res.status(403).send({message: 'forbidden access'})

      const data = await userCollection.findOne({ email: email });

      res.send(data);
    });

    app.get("/user/:email", verifyToken, async (req, res) => {
      const { email } = req.params;
      // if(email!== req?.decoded?.email) return res.status(403).send({message: 'forbidden access'})
      const data = await userCollection.findOne({ email: email });

      res.send(data);
    });

    app.post("/add_banner", verifyToken, verifyAdmin, async (req, res) => {
      const banner = req.body;

      const result = await bannerCollection.insertOne(banner);
      res.send(result);
    });

    app.get("/banners", verifyToken, verifyAdmin, async (req, res) => {
      const pagination = req.query;

      const currentPage = Number(pagination.currentPage) || 1;
      const pageSize = Number(pagination.pageSize) || 10;
      const totalData = (currentPage - 1) * pageSize;

      const total = await bannerCollection.countDocuments();

      const data = await bannerCollection
        .find({})
        .sort({ _id: -1 })
        .skip(totalData)
        .limit(pageSize)
        .toArray();
      res.send({ data, total });
    });

    app.patch(
      "/activate_banner",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const bannerId = req.body?.bannerId;
        const isActive = req.body?.isActive;

        await bannerCollection.updateMany({}, { $set: { isActive: false } });

        const result = await bannerCollection.updateOne(
          { _id: new ObjectId(bannerId) },
          { $set: { isActive: isActive } }
        );

        res.send(result);
      }
    );

    app.delete("/banner/:id", verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const result = await bannerCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.get("/banner", async (req, res) => {
      const data = await bannerCollection.findOne({ isActive: true });
      res.send(data);
    });

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const pagination = req.query;
      const currentPage = Number(pagination.currentPage) || 1;
      const pageSize = Number(pagination.pageSize) || 10;
      const totalData = (currentPage - 1) * pageSize;
      const total = await userCollection.countDocuments();
      const data = await userCollection
        .find({})
        .sort({ _id: -1 })
        .skip(totalData)
        .limit(pageSize)
        .toArray();
      res.send({ data, total });
    });

    app.patch("/status_action", verifyToken, verifyAdmin, async (req, res) => {
      const { status, id } = req.query;

      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: status } }
      );

      res.send(result);
    });

    app.patch("/role_action", verifyToken, verifyAdmin, async (req, res) => {
      const { role, id } = req.query;
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role: role } }
      );
      res.send(result);
    });

    app.post("/add_test", verifyToken, verifyAdmin, async (req, res) => {
      const test = req.body;
      const result = await testCollection.insertOne(test);
      res.send(result);
    });

    app.get("/all_tests", async (req, res) => {
      const { currentPage = 1, filter } = req.query;
      const pageSize = 6;
      const totalData = (currentPage - 1) * pageSize;
      const currentDate = new Date().setHours(0,0,0,0).getTime();

      try {
        const total = await testCollection.countDocuments();

        // Construct the filter for the date
        let query = { date: { $gte: currentDate } };
        if (filter !== undefined) {
          const filterDate = Number(filter);
          if (!isNaN(filterDate)) {
            query.date.$eq = filterDate;
          }
        }

        const data = await testCollection
          .find(query)
          .skip(totalData)
          .limit(pageSize)
          .toArray();

        res.send({ data, total });
      } catch (error) {
        res
          .status(500)
          .send({ error: "An error occurred while fetching the data" });
      }
    });

    app.get("/test_details/:id", async (req, res) => {
      const { id } = req.params;
      const data = await testCollection.findOne({ _id: new ObjectId(id) });
      res.send(data);
    });

    app.post("/check-coupon", verifyToken, async (req, res) => {
      const { coupon } = req.body;
      const data = await bannerCollection.findOne({
        coupon: coupon,
        isActive: true,
      });

      if (!data) {
        return res.send({ message: "coupon not found" });
      } else {
        return res.send({ message: "Applied coupon", rate: data?.rate });
      }
    });

    app.post("/appointment", verifyToken, async (req, res) => {
      const {
        date,
        email,
        name,
        serviceId,
        serviceTitle,
        serviceName,
        coupon,
        price,
        withOutDiscount,
        time,
      } = req.body;
      console.log(req.body);
      let rate = 0;
      const bookingTime = new Date().getTime();
      try {
        if (coupon) {
          const couponData = await bannerCollection.findOne({
            coupon: coupon,
            isActive: true,
          });
          if (couponData) {
            rate = Number(couponData.rate);
          }
        }

        let discountedPrice = price;
        if (rate > 0) {
          discountedPrice = price - (price * rate) / 100;
        }

        const result = await appointmentCollection.insertOne({
          date: date,
          discount: Number(discountedPrice),
          price: Number(withOutDiscount),
          name: name,
          email: email,
          serviceId: serviceId,
          serviceTitle: serviceTitle,
          serviceName: serviceName,
          coupon: coupon,
          time: time,
          bookingTime: bookingTime,
          status: "pending",
        });

        const updateQuery = { _id: new ObjectId(serviceId) };
        const update = { $inc: { dataCount: 1, slot: -1 } };
        await testCollection.updateOne(updateQuery, update);

        res.send(result);
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.get("/my_appointments", verifyToken, async (req, res) => {
      const { current } = req.query;
      const pageSize = 10;
      const totalData = (current - 1) * pageSize;

      const data = await appointmentCollection
        .find({ email: req?.decoded?.email })
        .sort({ _id: -1 })
        .skip(totalData)
        .limit(pageSize)
        .toArray();
      const total = await appointmentCollection.countDocuments({
        email: req?.decoded?.email,
      });
      res.send({ data, total });
    });

    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const { price, discountedPrice, serviceId } = req.body;
      let discount = 0;

      if (discountedPrice > 0) {
        discount = price - (price * discountedPrice) / 100;
      }

      console.log(discountedPrice);
      console.log(discount ? discount * 100 : price * 100);

      const amount = Math.ceil(discount ? discount * 100 : price * 100);
      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
        automatic_payment_methods: {
          enabled: true,
        },
      });

      await appointmentCollection.updateOne(
        { _id: new ObjectId(serviceId) },
        { $set: { price: discount ? discount : price, currency: "usd" } }
      );

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/cancel-appointment", verifyToken, async (req, res) => {
      const { _id, bookingTime, name, email, serviceId, serviceName, price } =
        req.body;
      const result = await appointmentCollection.deleteOne({
        _id: new ObjectId(_id),
      });

      await cancelAppointmentCollection.insertOne({
        appointmentId: _id,
        status: "refund pending",
        name: name,
        serviceId: serviceId,
        bookingTime: bookingTime,
        email: email,
        serviceName: serviceName,
        price: price,
      });

      res.send(result);
    });

    app.get(
      "/dashboard-all-test",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { current } = req.query;
        const pageSize = 10;
        const totalData = (current - 1) * pageSize;
        const data = await testCollection
          .find({})
          .sort({ _id: -1 })
          .skip(totalData)
          .limit(pageSize)
          .toArray();
        const total = await testCollection.countDocuments();
        res.send({ data, total });
      }
    );

    app.delete("/delete-test", verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.query;
      const result = await testCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.patch("/update-test", verifyToken, verifyAdmin, async (req, res) => {
      const { price, slot, id } = req.body;
      const result = await testCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { price: price, slot: slot } }
      );
      res.send(result);
    });

    app.get("/reservation/:id", verifyToken, verifyAdmin, async (req, res) => {
      const { email, current } = req.query;
      const { id } = req.params;

      const pageSize = 10;
      const totalData = (current - 1) * pageSize;

      let query = { serviceId: id };

      if (email) {
        query.email = { $regex: email, $options: "i" };
      }

      const result = await appointmentCollection
        .find(query)
        .sort({ _id: -1 })
        .skip(totalData)
        .limit(pageSize)
        .toArray();
      const total = await appointmentCollection.countDocuments(query);

      res.send({ result, total });
    });

    app.post(
      "/cancel-reservation",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const {
          _id,
          bookingTime,
          name,
          email,
          serviceId,
          serviceName,
          price,
          discount,
        } = req.body;
        const result = await appointmentCollection.deleteOne({
          _id: new ObjectId(_id),
        });

        await cancelAppointmentCollection.insertOne({
          appointmentId: _id,
          status: "refund pending",
          name: name,
          serviceId: serviceId,
          bookingTime: bookingTime,
          email: email,
          serviceName: serviceName,
          price: discount || price,
        });

        res.send(result);
      }
    );

    app.patch(
      "/update-reservation",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { id, link } = req.body;
        const result = await appointmentCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "delivered", link: link } }
        );
        res.send(result);
      }
    );

    app.get("/test-results", verifyToken, async (req, res) => {
      const { current } = req.query || 1;
      const pageSize = 10;
      const totalData = (current - 1) * pageSize;
      const data = await appointmentCollection
        .find({ email: req.decoded.email, status: "delivered" })
        .sort({ _id: -1 })
        .skip(totalData)
        .limit(pageSize)
        .toArray();
      const total = await appointmentCollection.countDocuments();
      res.send({ data, total });
    });

    app.get(
      "/user-test-report/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { email } = req.params;
        const data = await appointmentCollection
          .find({ email: email })
          .sort({ _id: -1 })
          .toArray();

        res.send(data);
      }
    );


    const mostlyBooked = async(req, res, next) => {
      const mostlyBookedData = await testCollection
        .aggregate([
          { $sort: { dataCount: -1 } },
          { $limit: 10 },
          {$addFields: {booking: "$dataCount"}},
          {$unset: "dataCount"}
        ])
        .toArray();
        req.mostlyBooked = mostlyBookedData
        
        next();
    }


    app.get("/statistics", verifyToken, verifyAdmin, mostlyBooked, async (req, res) => {
      
      const mostlyBookedData = req.mostlyBooked
      console.log(mostlyBookedData)

      const Complete = await appointmentCollection.countDocuments({
        status: "delivered",
      });
      const Pending = await appointmentCollection.countDocuments({
        status: "pending",
      });

      const data = {
        mostlyBooked : mostlyBookedData,
        status: [
          {name: "Completed", value: Complete},
          {name: 'Pending', value: Pending},
        ],
      };
      res.send(data);
    });

    app.get('/featured-test', mostlyBooked, async (req, res) => {
      const {mostlyBooked} = req
      res.send(mostlyBooked)
    })

    app.get('/profile', verifyToken, async (req, res) => {
      const {email} = req?.decoded
      const data = await userCollection.findOne({email})
      res.send(data)
    })

    app.patch('/update-profile', verifyToken, async (req, res) => {
      const {email} = req?.decoded
      console.log(email)
      const {name, avatar, district, upozilla} = req.body
      console.log(name, avatar, district, upozilla)
      const result = await userCollection.updateOne({email}, {$set: {name, avatar, district, upozilla}})
      console.log(result)
      res.send(result)
    })

    app.post('/recommendation', verifyToken, verifyAdmin, async (req, res) => {
      const data = req.body
      const result = await recommendationCollection.insertOne(data);
      res.send(result)
    })

    app.get('/recommendation', async (req, res) => {
      const data = await recommendationCollection.find({}).toArray()
      res.send(data)
    })

    app.delete('/recommendation/:id', verifyToken, verifyAdmin, async (req, res) => {
      const {id} = req.params
      const result = await recommendationCollection.deleteOne({_id: new ObjectId(id)})
      res.send(result)
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
