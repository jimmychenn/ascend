# Overview
Ascend take home assignment

High-level Overall flow:
1. Validate request data format
1. For each address lookup request, check cache for location data
1. If location not found, check ddb for location data
1. If location not found, make call to gmaps for location data
1. If location found, write to cache and db

Error cases:
1. Input request is not valid
2. ~~Address is not found and no location data returned~~ – after looking into this case a little more, this should not ever happen: https://cloud.google.com/blog/products/maps-platform/address-geocoding-in-google-maps-apis
3. Address maps to multiple locations
4. Gmaps is unavailable

## Validation checks
* The request body has to be an array.
* Any address that is missing any of the following fields will be rejected "address_line_one", "city", "state", "zip_code"

## API interface
The API maintains order between the request address list and the response address list.

The response is an array of objects with three fields: `responseBody`, `status` and `errors`. Each response corresponds to a single address lookup request. This is done so that any failed lookups won't affect other lookups.
Possible status and errors:
* OK: 200
* Invalid request or address: 400
* Address not found: 404
* Dependency failure (Google Maps API): 424

The 500 error code is conspicuously missing but I didn't find a need to add it anywhere as I am catching all errors in client code. On the list of things that can be done to improve availability is to have a top level catch block for any uncaught errors thrown and return a 500 if found. Alternatively, a functional approach can guarantee no leaky errors.

For the TypeScript initiated, the request and response object definitions are the following:
### Request
```
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
```

### Response
```
interface BatchAddressLookupResponse {
    response: AddressLookupResponse[],
}
interface AddressLookupResponse {
    responseBody: AddressLookupResponseBody,
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
```

### Scaling considerations
I implemented a very simple caching mechanism on top of the DB layer for performance. I configured it to hold only 5 items but this can obviously be increased. The purpose of this cache is to improve performance by immediately loading the desired data from memory and reduce the amount of database & network reads if the service has already seen the address recently. Once this limit has been reached, any further writes to the cache will delete a previous entry at random. This strategy can obviously be as complex as you'd like.

I also did not cache address lookup requests that did not result in location data. My thought here is that a client may want to retry failed requests due to transient issues such as data not yet available due to eventual consistency or dependency availability issues.

Further, there is an edge case where an existing address is stored in the cache/DB but has since been updated. This can be handled by implementing a TTL on the cache/DB such that rows are deleted after some amount of time.

# Testing
Before testing, please enter the below URL in a browser and see if it returns a "Hello World!" to check if it is up!
```
http://ascend-env.eba-it9cpady.us-west-2.elasticbeanstalk.com/address_lookup
```

### Invalid requests
Request bodies have to be arrays, otherwise an 'Invalid request' message will be returned.
```
curl -X POST -H "Content-Type: application/json" \
-d '{}' \
http://ascend-env.eba-it9cpady.us-west-2.elasticbeanstalk.com/address_lookup

curl -X POST -H "Content-Type: application/json" \
-d '{"address_line_one": "20 W 34th St", "city": "New York", "state": "NY", "zip_code": "10001"}' \
http://ascend-env.eba-it9cpady.us-west-2.elasticbeanstalk.com/address_lookup

curl -X POST -H "Content-Type: application/json" \
-d '{"address": "20 W 34th St New York NY 10001"}' \
http://ascend-env.eba-it9cpady.us-west-2.elasticbeanstalk.com/address_lookup
```

The following requests should return a valid response with status 400 'Invalid address' items.

```
curl -X POST -H "Content-Type: application/json" \
-d '[{"address_line_one": "", "city": "City", "state": "State", "zip_code": "99999"}]' \
http://ascend-env.eba-it9cpady.us-west-2.elasticbeanstalk.com/address_lookup

curl -X POST -H "Content-Type: application/json" \
-d '[{"address_line_one": "1600 Address Place", "city": "", "state": "State", "zip_code": "99999"}]' \
http://ascend-env.eba-it9cpady.us-west-2.elasticbeanstalk.com/address_lookup

curl -X POST -H "Content-Type: application/json" \
-d '[{"address_line_one": "1600 Address Place", "city": "City", "state": "", "zip_code": "99999"}]' \
http://ascend-env.eba-it9cpady.us-west-2.elasticbeanstalk.com/address_lookup

curl -X POST -H "Content-Type: application/json" \
-d '[{"address_line_one": "1600 Address Place", "city": "City", "state": "State", "zip_code": ""}]' \
http://ascend-env.eba-it9cpady.us-west-2.elasticbeanstalk.com/address_lookup
```


### Address that returns no location
```
curl -X POST -H "Content-Type: application/json" \
-d '[{"address_line_one": "1600 Address Place", "city": "City", "state": "State", "zip_code": "99999"}]' \
http://ascend-env.eba-it9cpady.us-west-2.elasticbeanstalk.com/address_lookup
```

### Some valid address
```
curl -X POST -H "Content-Type: application/json" \
-d '[{"address_line_one": "410 Terry Ave N", "city": "Seattle", "state": "WA", "zip_code": "98109"}]' \
http://127.0.0.1:3000/address_lookup
```

### Dependency issue
First take down the Google servers, then send a valid request with a new address and it should return a 424 :)

### Multiple valid addresses
curl -X POST -H "Content-Type: application/json" \
-d '[{"address_line_one": "20 W 34th St", "city": "New York", "state": "NY", "zip_code": "10001"}, {"address_line_one": "410 Terry Ave N", "city": "Seattle", "state": "WA", "zip_code": "98109"}, {"address_line_one": "601 N 34th St", "city": "Seattle", "state": "WA", "zip_code": "98103"}, {"address_line_one": "1600 Amphitheatre Pkwy", "city": "Mountain View", "state": "CA", "zip_code": "94043"}]' \
http://ascend-env.eba-it9cpady.us-west-2.elasticbeanstalk.com/address_lookup

### Multiple addresses along with an invalid request and an address with no location
curl -X POST -H "Content-Type: application/json" \
-d '[{"address_line_one": "20 W 34th St", "city": "New York", "state": "NY", "zip_code": "10001"}, {"address_line_one": "410 Terry Ave N", "city": "Seattle", "state": "WA", "zip_code": "98109"}, {"address_line_one": "601 N 34th St", "city": "Seattle", "state": "WA", "zip_code": "98103"}, {"address_line_one": "1600 Amphitheatre Pkwy", "city": "Mountain View", "state": "CA", "zip_code": "94043"}, {"address_line_one": "1600 Address Place", "city": "City", "state": "State", "zip_code": "99999"}, {"address_line_one": "1600 Address Place", "city": "City", "state": "", "zip_code": "99999"}]' \
http://ascend-env.eba-it9cpady.us-west-2.elasticbeanstalk.com/address_lookup


### Infrastructure
This simple service is a Node service running Express and deployed onto AWS Elastic Beanstalk with a DynamoDB database.

I followed this guide to get started: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/nodejs-dynamodb-tutorial.html?p=gsrc&c=ho_dnwa

Unfortunately custom CNAMEs are not supported out of the box.

### Development
First download DynamoDB Local: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.DownloadingAndRunning.html

Run
```
npm start
```

### Deployment
Run 
```
npm run zip
```
And use the ascend.zip file to upload to AWS Elastic Beanstalk and deploy.