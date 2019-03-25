import { PlatformAddress } from "codechain-primitives";
import { SDK } from "codechain-sdk";
import { MintAsset } from "codechain-sdk/lib/core/transaction/MintAsset";

export function mintHands(
    sdk: SDK,
    users: string[],
    date: Date,
    approver: string
): [MintAsset, MintAsset, MintAsset] {
    const hourHand = sdk.core.createAssetScheme({
        shardId: 0,
        metadata: JSON.stringify({
            name: "Hour Hand",
            description: `An hour hand of ${approver}'s clock`,
            icon_url:
                "https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Clock-hour-10.svg/200px-Clock-hour-10.svg.png",
            created_at: date.toISOString()
        }),
        approver: PlatformAddress.fromString(approver),
        supply: 1
    });

    const minuteHand = sdk.core.createAssetScheme({
        shardId: 0,
        metadata: JSON.stringify({
            name: "Minute Hand",
            description: `A minute hand of ${approver}'s clock`,
            icon_url:
                "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Clock-minute-15.svg/200px-Clock-minute-15.svg.png",
            created_at: date.toISOString()
        }),
        approver: PlatformAddress.fromString(approver),
        supply: 1
    });

    const secondHand = sdk.core.createAssetScheme({
        shardId: 0,
        metadata: JSON.stringify({
            name: "Second Hand",
            description: `A second hand of ${approver}'s clock`,
            icon_url:
                "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Red_Second_Hand_from_a_Clockjpg.jpeg/320px-Red_Second_Hand_from_a_Clockjpg.jpeg",
            created_at: date.toISOString()
        }),
        approver: PlatformAddress.fromString(approver),
        supply: 1
    });

    return [
        sdk.core.createMintAssetTransaction({
            scheme: hourHand,
            recipient: users[date.getUTCHours()]
        }),
        sdk.core.createMintAssetTransaction({
            scheme: minuteHand,
            recipient: users[date.getUTCMinutes()]
        }),
        sdk.core.createMintAssetTransaction({
            scheme: secondHand,
            recipient: users[date.getUTCSeconds()]
        })
    ];
}
