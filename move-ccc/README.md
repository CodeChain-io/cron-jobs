Move CCC
========

Move all CCC to the given address if imported account has more than threshold CCC.

Run manually
------------

You can run the script manually. The script will move the local CodeChain's first account's CCC to the specified platform address.

```
node move-ccc.js <PLATFORM_ADDRESS>
```

Run in Cronjob
--------------

We recommend running the script using the cronjob.

```
*/5 * * * * <NODE_PATH> <PROJECT_PATH>/move-ccc.js <PLATFORM_ADDRESS> > /tmp/move-ccc.log 2>&1
```
