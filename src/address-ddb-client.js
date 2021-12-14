const { DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const addressHasher = require('./address_hasher')

const region = process.env.REGION || "local"
const endpoint = process.env.ADDRESS_TABLE || "http://localhost:8000"
const ddbClient = new DynamoDBClient({region, endpoint})
const ddbTable =  process.env.ADDRESS_TABLE || 'AddressTable';

exports.getLocation = async (address) => {
    const hashKey = addressHasher.hashAddress(address)
    getItemCommand = new GetItemCommand({
        TableName: ddbTable,
        Key: {address_details: {S: hashKey}},
    })
    try {
        console.log(`Getting location from DynamoDB for address ${JSON.stringify(address)}`)
        address_item = await ddbClient.send(getItemCommand)
        if (address_item.Item) {
            console.log(`Read record from DynamoDB ${JSON.stringify(address_item.Item)}`)
            return {
                latitude: address_item.Item.latitude?.S,
                longitude: address_item.Item.longitude?.S,
            }
        }
    } catch (err) {
        console.error(`Read to DynamoDB for ${getItemCommand} failed with error: ${err}`)
        return {
            latitude: undefined,
            longitude: undefined,
        }
    }
}

exports.putLocation = async (address, location) => {
    const ddbItem = {
        address_details: {S: addressHasher.hashAddress(address)},
        latitude: {S: location.latitude},
        longitude: {S: location.longitude},
    }
    const putItemCommand = new PutItemCommand({
        TableName: ddbTable,
        Item: ddbItem,
    })
    try {
        console.log(`Writing location to DynamoDB for address ${JSON.stringify(address)}`)
        await ddbClient.send(putItemCommand)
        console.log(`Wrote record to DynamoDB ${JSON.stringify(ddbItem)}`)
    } catch (err) {
        // Failed to persist to db but we can fail gracefully
        console.error(`Write to DynamoDB for ${putItemCommand} failed with error: ${err}`)
    }
}