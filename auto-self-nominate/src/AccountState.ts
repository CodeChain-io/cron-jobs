import { SDK } from "codechain-sdk";
import { PlatformAddress } from "codechain-sdk/lib/core/classes";

const RLP = require("rlp");

export type AccountState = "Banned" | "Candidates" | "Jailed";
export type JailedAccountInfo = {
    deposits: number;
    custodyUntil: number;
    releasedAt: number;
};
export type CandidatesInfo = {
    [key: string]: {
        deposits: number;
        nominateEndAt: number;
    };
};
export type BannedAccountsInfo = {
    accounts: string[];
};
export type JailedAccountsInfo = {
    [key: string]: {
        deposits: number;
        custodyUntil: number;
        releasedAt: number;
    };
};

export type StatesInfos = CandidatesInfo | BannedAccountsInfo | JailedAccountsInfo;

function decodeInt(buffer: Buffer): number {
    return parseInt(buffer.toString("hex"), 16);
}

function decodePlatformAddressFromPubkey(networkId: string, buffer: Buffer): PlatformAddress {
    const pubkey = buffer.toString("hex");
    return PlatformAddress.fromPublic(pubkey, {
        networkId,
    });
}

function decodePlatformAddressFromAccountId(networkId: string, buffer: Buffer): PlatformAddress {
    const accountId = buffer.toString("hex");
    return PlatformAddress.fromAccountId(accountId, {
        networkId,
    });
}

function bannedAccountsDecoder(networkId: string, data: string): BannedAccountsInfo {
    const list: Buffer[] = RLP.decode(Buffer.from(data, "hex"));
    return {
        accounts: list.map(id => decodePlatformAddressFromAccountId(networkId, id).toString()),
    };
}

function candidatesDecoder(networkId: string, data: string): CandidatesInfo {
    const retval: CandidatesInfo = {};
    const list: Buffer[][] = RLP.decode(Buffer.from(data, "hex"));
    list.forEach(([encodedPubkey, encodedDeposit, encodedNominationEnd]) => {
        retval[decodePlatformAddressFromPubkey(networkId, encodedPubkey).toString()] = {
            nominateEndAt: decodeInt(encodedNominationEnd),
            deposits: decodeInt(encodedDeposit),
        };
    });
    return retval;
}

function JailedAccountsDecoder(networkId: string, data: string): JailedAccountsInfo {
    const retval: JailedAccountsInfo = {};
    const list: Buffer[][] = RLP.decode(Buffer.from(data, "hex"));
    list.forEach(([encodedAddress, encodedDeposit, encodedCustodyUntil, encodedReleasedAt]) => {
        retval[decodePlatformAddressFromAccountId(networkId, encodedAddress).toString()] = {
            deposits: decodeInt(encodedDeposit),
            custodyUntil: decodeInt(encodedCustodyUntil),
            releasedAt: decodeInt(encodedReleasedAt),
        };
    });
    return retval;
}

function getDecoder(state: AccountState): (networkId: string, data: string) => StatesInfos {
    switch (state) {
        case "Banned":
            return bannedAccountsDecoder;
        case "Candidates":
            return candidatesDecoder;
        case "Jailed":
            return JailedAccountsDecoder;
    }
}

export async function getStatesInfos(
    sdk: SDK,
    state: AccountState,
    bestBlockNumber: number,
): Promise<StatesInfos> {
    const data = (await sdk.rpc.engine.getCustomActionData(2, [state], bestBlockNumber))!;
    if (data == null) {
        return {};
    }
    return getDecoder(state)(sdk.networkId, data);
}
