# Overview
Ascend take home assignment

## Test Cases
### Invalid requests
```
curl -X POST -H "Content-Type: application/json" \
-d '[{"address_line_one": "", "city": "City", "state": "State", "zip_code": "99999"}]' \
http://127.0.0.1:3000/address_lookup

curl -X POST -H "Content-Type: application/json" \
-d '[{"address_line_one": "1600 Address Place", "city": "", "state": "State", "zip_code": "99999"}]' \
http://127.0.0.1:3000/address_lookup

curl -X POST -H "Content-Type: application/json" \
-d '[{"address_line_one": "1600 Address Place", "city": "City", "state": "", "zip_code": "99999"}]' \
http://127.0.0.1:3000/address_lookup

curl -X POST -H "Content-Type: application/json" \
-d '[{"address_line_one": "1600 Address Place", "city": "City", "state": "State", "zip_code": ""}]' \
http://127.0.0.1:3000/address_lookup
```


### Address that returns no location
```
curl -X POST -H "Content-Type: application/json" \
-d '[{"address_line_one": "1600 Address Place", "city": "City", "state": "State", "zip_code": "99999"}]' \
http://127.0.0.1:3000/address_lookup
```

### address not in datastore
```
curl -X POST -H "Content-Type: application/json" \
-d '[{"address_line_one": "20 W 34th St", "city": "New York", "state": "NY", "zip_code": "10001"}]' \
http://127.0.0.1:3000/address_lookup
```

### address in datastore but no location saved
```
curl -X POST -H "Content-Type: application/json" \
-d '[{"address_line_one": "410 Terry Ave N", "city": "Seattle", "state": "WA", "zip_code": "98109"}]' \
http://127.0.0.1:3000/address_lookup
```

### address in datastore with location saved
```
curl -X POST -H "Content-Type: application/json" \
-d '[{"address_line_one": "8867 Homewood Street", "city": "New Baltimore", "state": "MI", "zip_code": "48047"}]' \
http://127.0.0.1:3000/address_lookup
```
