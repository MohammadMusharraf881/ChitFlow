/* Add this function to js/api.js in the Auctions & bids section. */

function openAuction(id) {
  return request("POST", `/auctions/${id}/open`, null, db => {
    const auction = db.auctions.find(a => a.id === id);
    if (!auction) return fail("Auction not found.", "NOT_FOUND");
    if (auction.status !== "SCHEDULED") return fail("Only a scheduled auction can be opened.", "VALIDATION");

    auction.status = "OPEN";
    addAudit(db, "OPEN_AUCTION", "Auction", id, `Opened auction for Cycle ${auction.cycleNumber}.`);
    saveDb(db);
    return ok(auction);
  });
}
