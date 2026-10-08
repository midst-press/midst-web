import React, { PropsWithChildren, ReactElement } from 'react'
import uuid from 'uuid/v1'

interface IProps {}

const donorList = [
  'Juliet Shafto',
  'Myrrh Crow',
  'Lara Prescott',
  'Alejandro Puyana',
  'Dave Malone',
  'Sarah T. Jewell',
  'Patrycja Humienik',
  'Anonymous donors',
]

const sampleList = [
  'Carylon Huie',
  'Hedwig Lloyd',
  'Apolonia Joye',
  'David Pittsley',
  'Edwina Eppler',
  'Maricruz Swanberg',
  'Jeannie Balbuena',
  'Adolph Riendeau',
  'Mabelle Bugarin',
  'Sophie Zumwalt',
  'Benita Cowles',
  'Domenica Reif',
  'Virgie Crass',
  'Cherry Dobrowolski',
  'Bennett Funston',
  'Alyse Mortellaro',
  'Luise Snipes',
  'Charlyn Mance',
  'Yuki Shea',
  'Shannan Gholston',
  'Lilly Barrios',
  'Fredericka Yip',
  'Kurtis Dezern',
  'Julissa Demeo',
  'Hortensia Sansbury',
  'Eleanore Muldowney',
  'Amberly Cosner',
  'Tawanda Trumbauer',
  'Waneta Obregon',
  'Loura Round',
  'Michelle Govan',
  'Marx Schwartzkopf',
  'Blossom Evert',
  'Ardelia Murphy',
  'Awilda Pan',
  'Venetta Sung',
  'Christin Ayres',
  'Caren Clement',
  'Dario Walworth',
  'Kristel Mendelson',
  'Chandra Salvatore',
  'Lyman Moretti',
  'Ronna Spadaro',
  'Sima Wrona',
  'Vickey Somers',
  'Antwan Goyette',
  'Nicholle Collett',
  'Tanna Bax',
  'Marlena Yan',
  'Jetta Eakin',
]

function DonorWall({ children }: PropsWithChildren<IProps>): ReactElement {
  return (
    <div className="donor-wall">
      { children }
      <ul className="donor-list">
        {donorList.map(name => (
          <li key={uuid()}>{ name }</li>
        ))}
      </ul>
    </div>
  )
}

export default DonorWall
