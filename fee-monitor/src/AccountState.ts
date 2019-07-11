import { sdk } from "./config";
import { decodePlatformAddress, decodePlatformAddressfromPubkey } from "./Stake";

const RLP = require("rlp");

export enum AccountState {
    Eligible,
    Candidate,
    Validator,
    Banned,
    Jailed,
}

type QueryableStates = Exclude<AccountState, AccountState.Eligible>;

function statesToString(state: AccountState) {
    switch (state) {
        case AccountState.Banned:
            return "Banned";
        case AccountState.Candidate:
            return "Candidates";
        case AccountState.Jailed:
            return "Jail";
        case AccountState.Validator:
            return "Validators";
        case AccountState.Eligible:
            return "Eligible";
    }
}

function decodeValidatorsState(decoded: Buffer[][]): string[] {
    return decoded.map(([, , , pubkey]) => {
        return decodePlatformAddressfromPubkey(pubkey).value;
    });
}

function decodeCandidatesState(decoded: Buffer[][]): string[] {
    return decoded.map(([pubkey, ,]) => {
        return decodePlatformAddressfromPubkey(pubkey).value;
    });
}

function decodeJailedState(decoded: Buffer[][]): string[] {
    return decoded.map(([address, , ,]) => {
        return decodePlatformAddress(address).value;
    });
}

function decodeBannedState(decoded: Buffer[]): string[] {
    return decoded.map(buf => decodePlatformAddress(buf).value);
}

function statesToDecoder(
    state: QueryableStates,
): ((decoded: Buffer[]) => string[]) | ((decoded: Buffer[][]) => string[]) {
    switch (state) {
        case AccountState.Banned:
            return decodeBannedState;
        case AccountState.Candidate:
            return decodeCandidatesState;
        case AccountState.Validator:
            return decodeValidatorsState;
        case AccountState.Jailed:
            return decodeJailedState;
    }
}

export async function getAccountsInState(
    state: QueryableStates,
    blockNumber: number,
): Promise<string[]> {
    const queryString = statesToString(state);
    const data = await sdk.rpc.engine.getCustomActionData(2, [queryString], blockNumber);
    if (data == null) {
        return [];
    }
    const decoder = statesToDecoder(state);
    const decoded = RLP.decode(Buffer.from(data, "hex"));
    return decoder(decoded);
}
