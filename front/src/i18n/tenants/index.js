import { common } from './common';
import { list } from './list';
import { detail } from './detail';
import { operations } from './operations';
import { finance } from './finance';
import { contracts } from './contracts';
import { admin } from './admin';
import { legacy } from './legacy';
import { verification } from './verification';

const sections = { common, list, detail, operations, finance, contracts, admin, legacy, verification };

function build(language) {
  return Object.entries(sections).reduce((acc, [name, section]) => {
    acc[name] = section[language];
    return acc;
  }, {});
}

export const tenants = {
  es: build('es'),
  en: build('en'),
};
