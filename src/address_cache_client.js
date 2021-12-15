const addressHasher = require('./address_hasher')

const MAX_SIZE = 5
const cache = {}

exports.putLocation = (address, location) => {
    // Delete random property from cache if exceeds max size
    if (Object.keys(cache).length === MAX_SIZE) {
        const keys = Object.keys(cache)
        delete cache[keys[keys.length * Math.random() << 0]]
    }
    const addressHash = addressHasher.hashAddress(address)
    console.log(`Writing location ${JSON.stringify(location)} to cache for address ${JSON.stringify(address)}`)
    cache[addressHash] = location
}

exports.getLocation = (address) => {
    console.log(`Getting location from cache for address ${JSON.stringify(address)}`)
    const location = cache[addressHasher.hashAddress(address)]
    console.log(`Got location from cache ${JSON.stringify(location)}`)
    return location
}