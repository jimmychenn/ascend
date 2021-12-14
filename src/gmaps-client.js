const fetch = require('node-fetch')
const addressDdbClient = require('./address-ddb-client')
const addressCacheClient = require('./address_cache_client')

const API_KEY = 'AIzaSyDnnVyf8Pic48F08DF-sRwYZGnpKVlGX6Y'
const gmaps_endpoint = 'https://maps.googleapis.com/maps/api/geocode/json'

exports.getLocation = async(address) => {
    const gmapsEndpoint = new URL(gmaps_endpoint)
    const formattedAddress = `${address.address_line_one}, ${address.city}, ${address.state} ${address.zip_code}`.replace(/\s/g, '+')
    gmapsEndpoint.search = new URLSearchParams([['address', formattedAddress], ['key', API_KEY]])
    try {
        console.log(`Getting location from geocoding for address ${JSON.stringify(address)}`)
        const gResponse = await fetch(gmapsEndpoint)
        const gResponseBody = await gResponse.json()

        const gpsLocations = gResponseBody.results.map(result => result.geometry.location)
        return gpsLocations
        // const gpsLocation = gResponseBody.results[0].geometry.location
        // addressDdbClient.putLocation(address, gpsLocation)
        // addressCacheClient.putLocation(address, gpsLocation)
        // return {
        //     latitude: String(gpsLocation.lat),
        //     longitude: String(gpsLocation.lng),
        // }
        // locationResponse.responseBody.latitude = String(gpsLocation.lat)
        // locationResponse.responseBody.longitude = String(gpsLocation.lng)
        // locationResponse.status = 200
        // return locationResponse
    } catch (err) {
        console.log(`Error occurred when fetching data from Google geocoding API: ${err}`)
        return undefined
    }
}