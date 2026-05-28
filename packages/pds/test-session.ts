async function main() {
  const dbConfig = {
    accountDbLoc: process.env.DB_POSTGRES_URL,
    disableWalAutoCheckpoint: false,
  }
  console.log(dbConfig)
  // I don't need AccountManager to just verify if throwing inside AccountManager...
}
main().catch(console.error)
