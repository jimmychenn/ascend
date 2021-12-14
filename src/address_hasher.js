exports.hashAddress = (addressObject) => {
    hashKey = `${addressObject.address_line_one}_${addressObject.city}_${addressObject.state}_${addressObject.zip_code}`
    hashKey = hashKey.replace(/\s/g, '-') // Replace whitespace with '-'
    return hashKey
}