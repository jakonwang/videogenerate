declare module 'qrcode' {
  type DataUrlOptions = {
    width?: number
    margin?: number
  }

  const QRCode: {
    toDataURL(value: string, options?: DataUrlOptions): Promise<string>
  }

  export default QRCode
}
