const { CreateTableCommand, DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb")
const fs = require('fs')
const express = require('express');
const bodyParser = require('body-parser')

const addressCacheClient = require('./src/address_cache_client')
const addressDdbClient = require('./src/address-ddb-client')
const gmapsClient = require('./src/gmaps-client')


const region = process.env.AWS_REGION || "local"

// Used only for testing on localhost
if (region === "local") {
    // Hardcoding this for convenience and testing purposes.
    const endpoint = "http://localhost:8000"
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

    const mock_data = JSON.parse(fs.readFileSync('address_data.json', 'utf8'));

    (async () => {
        try {
            const result = await ddbClient.send(createTableCommand)
            console.log(`Created ddb table. Status: ${result.$metadata.httpStatusCode}`)
        } catch (err) {
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
            console.log(err)
        }
    })();
}

const app = express();
const jsonParser = bodyParser.json()

app.get('/', function(req, res) {
    res.send('Hello world!')
});

function isInvalidRequest(req) {
    if (!Array.isArray(req.body)) {
        return true
    }
}

function isInvalidAddress(address) {
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

function createResponse(address, location, status, error) {
    return {
        responseBody: {
            ...address,
            ...location,
        },
        status: status,
        error: error,
    }
}

app.post('/address_lookup', jsonParser, async(req, res) => {
    res.type('application/json')

    if (isInvalidRequest(req)) {
        // console.log(req.body)
        return await res.status('400').send('Invalid request')
    }

    addressAndLocations = await Promise.all(
        req.body.map(async(address) => {
            if (isInvalidAddress(address)) {
                return createResponse(address, undefined, 400, 'Invalid address')
            }
            // If location data is already present then we will assume that those are correct
            if (address.longitude && address.latitude) {
                return createResponse(address, undefined, 200, undefined)
            }

            // Check if location data exists in local cache
            location = addressCacheClient.getLocation(address)
            if (location && location.longitude && location.latitude) {
                return createResponse(address, location, 200, undefined)
            }

            // Check if location data exists in datastore
            location = await addressDdbClient.getLocation(address)
            if (location && location.longitude && location.latitude) {
                return createResponse(address, location, 200, undefined)
            }

            // Get location from gmaps
            const locations = await gmapsClient.getLocation(address)
            if (locations === undefined) {
                // Gmaps didn't return a response
                return createResponse(address, location, 424, 'Error fetching Google geocoding API')
            } else if (locations.length === 0) {
                // Address not found
                return createResponse(address, location, 404, 'Invalid address: not found')
            } else if (locations.length > 1) {
                // This should not happen by design: https://cloud.google.com/blog/products/maps-platform/address-geocoding-in-google-maps-apis
                return createResponse(address, location, 400, 'Invalid address: ambiguous location')
            } else {
                // Converting to string for consistency
                location = {
                    latitude: String(locations[0].lat),
                    longitude: String(locations[0].lng),
                }
                addressDdbClient.putLocation(address, location)
                addressCacheClient.putLocation(address, location)
                return createResponse(address, location, 200, undefined)
            }
        }
    ))
    console.log(`addressAndLocations after reads ${JSON.stringify(addressAndLocations)}`)
    res.status(200).send(addressAndLocations)
})

var port = process.env.PORT || 3000;

var server = app.listen(port, function () {
    console.log('Server running at http://127.0.0.1:' + port + '/');
});