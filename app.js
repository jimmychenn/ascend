const { CreateTableCommand, DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb")
const fs = require('fs')
const fetch = require('node-fetch')

var express = require('express');
var bodyParser = require('body-parser')

// var AWS = require('aws-sdk');
region = process.env.REGION || "local"
endpoint = process.env.ADDRESS_TABLE || "http://localhost:8000"
// AWS.config.region = process.env.REGION || "local"
// AWS.config.update({
//     region: "local",
//     endpoint: "http://localhost:8000"
// });

const ddbClient = new DynamoDBClient({region, endpoint})
const ddbTable =  process.env.ADDRESS_TABLE || 'AddressTable';
const createTableCommand = new CreateTableCommand({
    TableName: ddbTable,
    AttributeDefinitions: [{AttributeName: "address_details", AttributeType: "S"}],
    KeySchema: [{AttributeName: "address_details", KeyType: "HASH"}],
    ProvisionedThroughput: {
        ReadCapacityUnits: 1,
        WriteCapacityUnits: 1
    }
});

// TODO: Secure this.
const API_KEY = 'AIzaSyDnnVyf8Pic48F08DF-sRwYZGnpKVlGX6Y'
const gmaps_endpoint = 'https://maps.googleapis.com/maps/api/geocode/json'


const mock_data = JSON.parse(fs.readFileSync('address_data.json', 'utf8'));

(async () => {
    try {
        const result = await ddbClient.send(createTableCommand)
        console.log(`Created ddb table. Status: ${result.$metadata.httpStatusCode}`)
    } catch (err) {
        console.log('error')
        console.log(err)
    }
    try {
        mock_data.forEach(async(address) => {
            item = {
                address_details: {S: address.address_details},
            }
            if (address.latitude && address.longitude) {
                item = {
                    ...item,
                    latitude: {S: address.latitude},
                    longitude: {S: address.longitude},
                }
            }

            const putItemsCommand = new PutItemCommand({
                TableName: ddbTable,
                Item: item,
            })
            const result = await ddbClient.send(putItemsCommand)
            console.log(`Writing items. Status: ${result.$metadata.httpStatusCode}`)
        });
    } catch (err) {
        console.log('error')
        console.log(err)
    }
})();


const app = express();
const jsonParser = bodyParser.json()

app.get('/', function(req, res) {
    res.send('Hello world!')
});


function convertAddressObjectToHashKey(addressObject) {
    hashKey = `${addressObject.address_line_one}_${addressObject.city}_${addressObject.state}_${addressObject.zip_code}`
    hashKey = hashKey.replace(/\s/g, '-') // Replace whitespace with '-'
    return hashKey
}

function convertHashKeyToAddressObject(hashKey) {
    addressDetails = hashKey.replace(/-/g, ' ') // Replace '-' with whitespace
    addressDetails = addressDetails.split('_')
    return {
        address_line_one: addressDetails[0],
        city: addressDetails[1],
        state: addressDetails[2],
        zip_code: addressDetails[3],
    }
}

function isInvalidRequest(req) {
    if (!Array.isArray(req.body)) {
        return true
    }
    for (address of req.body) {
        if (!address.address_line_one) {
            return true
        }
        if (!address.city) {
            return true
        }
        if (!address.state) {
            return true
        }
        if (!address.zip_code) {
            return true
        }
    }
}

app.post('/address_lookup', jsonParser, async(req, res) => {
    if (isInvalidRequest(req)) {
        // console.log(req.body)
        return await res.status('400').send('Invalid request')
    }
    // addressDetails = req.body.map(convertAddressObjectToHashKey)
    // console.log(addressDetails)
    // Convert to DynamoDB requests

    // Perform reads
    address_items = await Promise.all(req.body.map(async(address) => {
        const hashKey = convertAddressObjectToHashKey(address)
        console.log(hashKey)
        ddbRequest = new GetItemCommand({
            TableName: ddbTable,
            Key: {'address_details': {'S': hashKey}},
        })
        console.log(ddbRequest)
        try {
            address_item = await ddbClient.send(ddbRequest)
            if (address_item.Item) {
                // If entry exists
                return address_item
            } else {
                return address
            }
        } catch (err) {
            console.error(`Read to DynamoDB for ${ddbRequest} failed with error: ${err}`)
            return address
        }
    }))
    console.log(`address_items after reads ${JSON.stringify(address_items)}`)

    // For failed requests or addresses not stored in database, fetch location from cache else fetch from gmaps
    address_items = await Promise.all(address_items.map(async(item) => {
        if (item.Item === undefined || item.$metadata.httpStatusCode !== 200) {
            gmapsEndpoint = new URL('https://maps.googleapis.com/maps/api/geocode/json')
            formattedAddress = `${item.address_line_one}, ${item.city}, ${item.state} ${item.zip_code}`.replace(/\s/g, '+')
            console.log(formattedAddress)
            gmapsEndpoint.search = new URLSearchParams([['address', formattedAddress], ['key', API_KEY]])
            response = await fetch(gmapsEndpoint)
            responseBody = await response.json()
            // TODO: Return some client error code if more than one result is returned
            if (responseBody.results.length === 0) {
                return {
                    httpStatusCode: 400,
                    reason: 'Invalid address: not found'
                }
            } else if (responseBody.results.length > 1) {
                // This should never happen if no empty fields
                return {
                    httpStatusCode: 400,
                    reason: 'Invalid address: ambiguous location'
                }
            } else {
                gpsLocation = responseBody.results[0].geometry.location
                return {
                    ...item,
                    latitude: String(gpsLocation.lat),
                    longitude: String(gpsLocation.lng),
                }                
            }
        } else if (item.$metadata.httpStatusCode === 200) {
            return {
                ...convertHashKeyToAddressObject(item.Item.address_details.S),
                latitude: item.Item.latitude.S,
                longitude: item.Item.longitude.S,
            }
        }
    }))

    console.log(address_items)

})



// app.post('/signup', function(req, res) {
//     var item = {
//         'email': {'S': req.body.email},
//         'name': {'S': req.body.name},
//         'preview': {'S': req.body.previewAccess},
//         'theme': {'S': req.body.theme}
//     };

//     ddb_client.putItem({
//         'TableName': ddbTable,
//         'Item': item,
//         'Expected': { email: { Exists: false } }        
//     }, function(err, data) {
//         if (err) {
//             var returnStatus = 500;

//             if (err.code === 'ConditionalCheckFailedException') {
//                 returnStatus = 409;
//             }

//             res.status(returnStatus).end();
//             console.log('DDB_client Error: ' + err);
//         } else {
//             sns.publish({
//                 'Message': 'Name: ' + req.body.name + "\r\nEmail: " + req.body.email 
//                                     + "\r\nPreviewAccess: " + req.body.previewAccess 
//                                     + "\r\nTheme: " + req.body.theme,
//                 'Subject': 'New user sign up!!!',
//                 'TopicArn': snsTopic
//             }, function(err, data) {
//                 if (err) {
//                     res.status(500).end();
//                     console.log('SNS Error: ' + err);
//                 } else {
//                     res.status(201).end();
//                 }
//             });            
//         }
//     });
// });

var port = process.env.PORT || 3000;

var server = app.listen(port, function () {
    console.log('Server running at http://127.0.0.1:' + port + '/');
});