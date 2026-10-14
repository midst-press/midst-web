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
