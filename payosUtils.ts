import crypto from 'crypto';

/**
 * Xác thực chữ ký webhook PayOS thủ công.
 * @param data Dữ liệu webhook (object)
 * @param signature Chữ ký nhận được
 * @param checksumKey Khóa bí mật
 * @returns true nếu hợp lệ, false nếu không
 */
export function isValidSignatureManual(data: any, signature: string, checksumKey: string): boolean {
    if (!data || typeof data !== 'object' || !signature || !checksumKey) return false;

    function sortObjDataByKey(object: any): any {
        return Object.keys(object)
            .sort()
            .reduce((obj: any, key) => {
                obj[key] = object[key];
                return obj;
            }, {});
    }

    function convertObjToQueryStr(object: any): string {
        return Object.keys(object)
            .filter((key) => object[key] !== undefined)
            .map((key) => {
                let value = object[key];
                if (value && Array.isArray(value)) {
                    value = JSON.stringify(value.map((val) =>
                        typeof val === 'object' && val !== null ? sortObjDataByKey(val) : val
                    ));
                } else if (value && typeof value === 'object') {
                    value = JSON.stringify(sortObjDataByKey(value));
                }

                if ([null, undefined, "undefined", "null"].includes(value)) {
                    value = "";
                }
                return `${key}=${value}`;
            })
            .join("&");
    }

    try {
        const sortedDataByKey = sortObjDataByKey(data);
        const dataQueryStr = convertObjToQueryStr(sortedDataByKey);
        const calculatedSignature = crypto.createHmac("sha256", checksumKey)
            .update(dataQueryStr)
            .digest("hex");
        console.log("[Webhook Verify Manual] Data string:", dataQueryStr);
        console.log("[Webhook Verify Manual] Calculated Signature:", calculatedSignature);
        console.log("[Webhook Verify Manual] Received Signature:", signature);
        return calculatedSignature === signature;
    } catch (error) {
        console.error("[Webhook Verify Manual] Error during manual signature verification:", error);
        return false;
    }
}
