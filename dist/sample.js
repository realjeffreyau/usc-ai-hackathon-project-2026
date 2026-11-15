// Fictional profile created solely for the demo.
const row=(title,status,children=[])=>({title,status,children});
export const sample={
  total:128, earned:62, progress:14, remaining:52,
  completed:['MATH-226','CSCI-102','CHEM-105A'],
  suggested:['MATH-245','BME-210','EE-202','EE-109','CHEM-105B','HBIO-301','BME-201'],
  requirements:[
    row('Engineering math','remaining',[row('MATH 245 · Mathematics of Physics and Engineering I','remaining')]),
    row('Biomedical engineering core','remaining',[row('BME 210 · Biomedical Computer Simulation Methods','remaining'),row('EE 202 · Linear Circuits','remaining')]),
    row('Biology electives','remaining',[row('HBIO 301 · Human Anatomy','remaining')]),
    row('Writing','progress',[row('Upper-division writing','progress')]),
    row('Lower-division mathematics','complete',[row('MATH 226 · Calculus III','complete')]),
    row('Introductory programming','complete',[row('CSCI 102 · Fundamentals of Computation','complete')]),
  ],
};
