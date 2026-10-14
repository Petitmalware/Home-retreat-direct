# Christmas collection

The first deployment adds 20 real Costway products to the existing store: 10 Christmas trees, 6 wreaths and garlands, and 4 illuminated or inflatable outdoor decorations. Every product has at least six distinct local image files; the range also includes official product/assembly videos where available. The first installation turns Christmas **on**, as requested by the owner.

## Show or hide the collection

Open **Admin → Your business → Christmas on / off**, or `/admin/seasonal`.

The **Show Christmas on the website** switch saves immediately. On shows the homepage feature, Christmas navigation, collection categories, products, search results and sitemap entries. Off hides these pages and prevents new cart additions and order submissions for Christmas products, including items saved in a cart earlier. Existing order records and emails remain available.

**Optional dates:** expand the schedule, choose the first and last visible day, and select **Use these dates**. Dates use Eastern Time (`America/New_York`), and the final day is included. Visibility is evaluated when a page or checkout is requested; no cron job is needed. The manual switch replaces the schedule. The same products can be reused next year with a new date range.

Owner, administrator and product manager roles can use these controls. Customers cannot change them. Each change is recorded in the private activity history.

## Products, photos, videos and discounts

Open any listed product from the seasonal admin page. Staff can replace/reorder images, edit details and prices, change its discount, or replace/remove its video URL. Active Christmas products require at least six gallery images and at least four product photographs. Select the **Christmas at Home** collection when adding another seasonal product. Christmas categories also inherit the visibility controls.

Regular prices were matched to the selected size/pack/colour displayed on the official product page, rather than the parent product's potentially different JSON-LD price. The store applies the owner's requested **15% discount**. Source prices and availability can change; each source quote and its check date are recorded privately in **Price records**. Existing orders keep their original price snapshots.

No warehouse quantities, customer reviews or supplier partnership have been invented. These products use the store's existing availability review before payment. Product-specific shipping dates and Christmas delivery eligibility must be confirmed for each order.

Photography and video sources are retained in private staff records. Supplier photography is copyrighted; these records do not establish a commercial reuse licence or an authorized supplier relationship. Videos stream from the recorded manufacturer URLs on playback and have a fallback link if playback fails. They are not customer review videos.

## Update the existing VPS

After this commit is pushed to GitHub and the Docker build check passes, paste this block into the SSH terminal:

```bash
sudo -H -u administrator git -C /opt/home-retreat-direct/current pull --ff-only &&
cd /opt/home-retreat-direct/current &&
sudo bash deploy/update-production.sh
```

The update builds the application, runs the existing migration check and adds the Christmas catalog transactionally. It preserves existing accounts, orders, products and private server configuration. Repeated deployments preserve staff edits and the current seasonal switch; they do not re-enable a collection the owner has hidden. An already-running email worker is updated as well. No Nginx or certificate changes are required.

## Verify after deployment

1. Confirm the update ends with `{"status":"ok"}` and healthy app/database containers.
2. Refresh the browser and open `/collections/christmas`. Check product galleries, prices, details and the supplied videos on desktop and mobile.
3. Open `/admin/seasonal`. Turn Christmas off, then refresh a separate customer window. The navigation should disappear, product/collection links should return 404, and `/sitemap.xml` should omit Christmas URLs.
4. An earlier seasonal cart should mark the items unavailable and refuse a new order. Existing orders should remain accessible to authorized customers/staff.
5. Turn Christmas on again. No photographs, products or prices need to be entered again.
