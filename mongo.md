docker exec -it smart-library-user-db-1 mongosh
use smart_library_users
smart_library_users> db.users.find().pretty()
