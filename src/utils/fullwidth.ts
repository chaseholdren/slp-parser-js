import * as lodash from 'lodash';

export function toHalfwidth(str: string) {
  // Code reference from https://github.com/sampathsris/ascii-fullwidth-halfwidth-convert

  // Converts a fullwidth character to halfwidth
  const convertChar = (charCode: number) => {
    if (charCode > 0xff00 && charCode < 0xff5f) {
      return 0x0020 + (charCode - 0xff00);
    }

    if (charCode === 0x3000) {
      return 0x0020;
    }

    return charCode;
  };

  const ret = lodash.map(str, (char) => convertChar(char.charCodeAt(0)));

  return String.fromCharCode(...ret);
}
