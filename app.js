const { CreateTableCommand, DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb")
const fs = require('fs')
const fetch = require('node-fetch')

const express = require('express');
const bodyParser = require('body-parser')


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

const addressCacheClient = require('./src/address_cache_client')
const addressDdbClient = require('./src/address-ddb-client')
const gmapsClient = require('./src/gmaps-client')

// Hardcoding this for convenience and testing purposes.



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

/*
interface BatchAddressLookupRequest {
    request: AddressLookupRequest[],
}

// A client may optionally pass in latitude or longitude when retrying a batch of requests if some failed due to some retriable failure like a dependency availability issue
interface AddressLookupRequest {
    address_line_one: string,
    city: string,
    state: string,
    zip_code: string,
    latitude?: string,
    longitude?: string,
}

interface BatchAddressLookupResponse {
    response: AddressLookupResponse[],
}
interface AddressLookupResponse {
    body: AddressLookupResponseBody,
    status: number,
    errors: string[],
}

// latitude and longitude keys will always be set in the response but set to undefined if not available
interface AddressLookupResponseBody {
    address_line_one: string,
    city: string,
    state: string,
    zip_code: string,
    latitude: string|undefined,
    longitude: string|undefined,
}

Overall flow:
1. For each address entry, make a read request to the db and transform to response body
2. For each entry without latitude or longitude, check cache for location data
3. For each entry without latitude or longitude, make call to gmaps for location data

Error cases:
1. Input request format is not valid
2. Address is not found and no location data returned
3. Address maps to multiple locations
4. Gmaps is unavailable

*/

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
            location = addressCacheClient.getLocation(address)
            if (location && location.longitude && location.latitude) {
                return createResponse(address, location, 200, undefined)
            }

            location = await addressDdbClient.getLocation(address)
            if (location && location.longitude && location.latitude) {
                return createResponse(address, location, 200, undefined)
            }

            const locations = await gmapsClient.getLocation(address)
            if (locations === undefined) {
                return createResponse(address, location, 424, 'Error fetching Google geocoding API')
            } else if (locations.length === 0) {
                return createResponse(address, location, 404, 'Invalid address: not found')
            } else if (locations.length > 1) {
                // This should never happen if no empty fields
                return createResponse(address, location, 400, 'Invalid address: ambiguous location')
            } else {
                location = {
                    latitude: locations[0].lat,
                    longitude: locations[0].lng,
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