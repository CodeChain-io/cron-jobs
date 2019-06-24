import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as fs from "fs";
import "mocha";
import * as os from "os";
import {
    createLastCheckedBlockIfNotExist,
    LAST_BLOCK_NUMBER,
    readLastCheckedBlock,
    writeLastCheckedBlock
} from "./file";
chai.use(chaiAsPromised);
const expect = chai.expect;

describe("file", function() {
    beforeEach(function() {
        process.chdir(os.tmpdir());
        try {
            fs.unlinkSync(LAST_BLOCK_NUMBER);
        } catch (err) {
            // ignore the error
        }
    });

    it("cannot read non-exist file", async function() {
        expect(readLastCheckedBlock()).be.rejected;
    });

    it("the new file has 0", async function() {
        expect(await createLastCheckedBlockIfNotExist()).be.true;
        const blockNumber = await readLastCheckedBlock();
        expect(blockNumber).equal(0);
    });

    [0, 1, 2, 10, 100, 1000, 1234567890].forEach(function(number) {
        it(number.toString(10), async function() {
            expect(await createLastCheckedBlockIfNotExist()).be.true;
            await writeLastCheckedBlock(number);
            const blockNumber = await readLastCheckedBlock();
            expect(blockNumber).equal(number);
        });
    });
});
