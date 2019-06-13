import { sdk } from "./config";
import { U64, U64Value } from "codechain-primitives/lib/value/U64";

// This is unsafe. Please use when you are confident that it is safe.
function U64ValueToNumber(value: U64Value) {
    return parseInt(U64.ensure(value).toString(10), 10);
}

export interface CommonParams {
    maxExtraDataSize: number;
    maxAssetSchemeMetadataSize: number;
    maxTransferMetadataSize: number;
    maxTextContentSize: number;
    networkID: string;
    minPayCost: number;
    minSetRegularKeyCost: number;
    minCreateShardCost: number;
    minSetShardOwnersCost: number;
    minSetShardUsersCost: number;
    minWrapCccCost: number;
    minCustomCost: number;
    minStoreCost: number;
    minRemoveCost: number;
    minMintAssetCost: number;
    minTransferAssetCost: number;
    minChangeAssetSchemeCost: number;
    minIncreaseAssetSupplyCost: number;
    minComposeAssetCost: number;
    minDecomposeAssetCost: number;
    minUnwrapCccCost: number;
    maxBodySize: number;
    snapshotPeriod: number;
    termSeconds?: number | null;
    nominationExpiration?: number | null;
    custodyPeriod?: number | null;
    releasePeriod?: number | null;
    maxNumOfValidators?: number | null;
    minNumOfValidators?: number | null;
    delegationThreshold?: number | null;
    minDeposit?: number | null;
}

export interface MinimumFees {
    [param: string]: number;
}

export async function getCommonParams(blockNumber: number): Promise<CommonParams> {
    return new Promise((resolve, reject) => {
        sdk.rpc.sendRpcRequest("chain_getCommonParams", [blockNumber]).then(result => {
            try {
                resolve({
                    maxExtraDataSize: U64ValueToNumber(result.maxExtraDataSize),
                    maxAssetSchemeMetadataSize: U64ValueToNumber(result.maxAssetSchemeMetadataSize),
                    maxTransferMetadataSize: U64ValueToNumber(result.maxTransferMetadataSize),
                    maxTextContentSize: U64ValueToNumber(result.maxTextContentSize),
                    networkID: result.networkID,
                    minPayCost: U64ValueToNumber(result.minPayCost),
                    minSetRegularKeyCost: U64ValueToNumber(result.minSetRegularKeyCost),
                    minCreateShardCost: U64ValueToNumber(result.minCreateShardCost),
                    minSetShardOwnersCost: U64ValueToNumber(result.minSetShardOwnersCost),
                    minSetShardUsersCost: U64ValueToNumber(result.minSetShardUsersCost),
                    minWrapCccCost: U64ValueToNumber(result.minWrapCccCost),
                    minCustomCost: U64ValueToNumber(result.minCustomCost),
                    minStoreCost: U64ValueToNumber(result.minStoreCost),
                    minRemoveCost: U64ValueToNumber(result.minRemoveCost),
                    minMintAssetCost: U64ValueToNumber(result.minMintAssetCost),
                    minTransferAssetCost: U64ValueToNumber(result.minTransferAssetCost),
                    minChangeAssetSchemeCost: U64ValueToNumber(result.minChangeAssetSchemeCost),
                    minIncreaseAssetSupplyCost: U64ValueToNumber(result.minIncreaseAssetSupplyCost),
                    minComposeAssetCost: U64ValueToNumber(result.minComposeAssetCost),
                    minDecomposeAssetCost: U64ValueToNumber(result.minDecomposeAssetCost),
                    minUnwrapCccCost: U64ValueToNumber(result.minUnwrapCccCost),
                    maxBodySize: U64ValueToNumber(result.maxBodySize),
                    snapshotPeriod: U64ValueToNumber(result.snapshotPeriod),
                    termSeconds:
                        result.termSeconds == null ? null : U64ValueToNumber(result.termSeconds),
                    nominationExpiration:
                        result.nominationExpiration == null
                            ? null
                            : U64ValueToNumber(result.nominationExpiration),
                    custodyPeriod:
                        result.custodyPeriod == null
                            ? null
                            : U64ValueToNumber(result.custodyPeriod),
                    releasePeriod:
                        result.releasePeriod == null
                            ? null
                            : U64ValueToNumber(result.releasePeriod),
                    maxNumOfValidators:
                        result.maxNumOfValidators == null
                            ? null
                            : U64ValueToNumber(result.maxNumOfValidators),
                    minNumOfValidators:
                        result.minNumOfValidators == null
                            ? null
                            : U64ValueToNumber(result.minNumOfValidators),
                    delegationThreshold:
                        result.delegationThreshold == null
                            ? null
                            : U64ValueToNumber(result.delegationThreshold),
                    minDeposit:
                        result.minDeposit == null ? null : U64ValueToNumber(result.minDeposit),
                });
            } catch (e) {
                reject(
                    Error(
                        `Expected chain_getCommonParams to return JSON of CommonParams, but an error occured: ${e.toString()}`,
                    ),
                );
            }
        });
    });
}

export function getMinimumFees(params: CommonParams): MinimumFees {
    return {
        pay: params.minPayCost,
        setRegularKey: params.minSetRegularKeyCost,
        createShard: params.minCreateShardCost,
        setShardOwners: params.minSetShardOwnersCost,
        setShardUsers: params.minSetShardUsersCost,
        wrapCCC: params.minWrapCccCost,
        custom: params.minCustomCost,
        store: params.minStoreCost,
        remove: params.minRemoveCost,
        mintAsset: params.minMintAssetCost,
        transferAsset: params.minTransferAssetCost,
        changeAssetScheme: params.minChangeAssetSchemeCost,
        increaseAssetSupply: params.minIncreaseAssetSupplyCost,
        composeAsset: params.minComposeAssetCost,
        decomposeAsset: params.minDecomposeAssetCost,
        unwrapCCC: params.minUnwrapCccCost,
    };
}
