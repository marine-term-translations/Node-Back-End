import swaggerAutogen from 'swagger-autogen';

const swaggerAutogenInstance = swaggerAutogen();

const doc = {
  info: {
    title: 'API Documentation',
    description: 'Description de l\'API',
  },
  host: 'localhost:3000',
  schemes: ['http'],
};

const outputFile = './swagger_output.json';
const routes  = ['./server.js'];


swaggerAutogen()(outputFile, routes, doc);
